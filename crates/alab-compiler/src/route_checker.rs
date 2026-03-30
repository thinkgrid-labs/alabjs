/**
 * Compiler-aware route reference checker.
 *
 * Walks all `.ts` / `.tsx` files under `app_dir` and validates:
 *   - `<RouteLink to="/path" />` — JSX prop string literals
 *   - `<Link href="/path" />`   — alias for the above
 *   - `navigate("/path")`       — programmatic navigation calls
 *
 * Each path is checked against the compiled route manifest. Violations
 * are returned as `RouteViolation` values and surfaced as build errors.
 */

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Argument, Declaration, Expression, JSXAttributeItem, JSXAttributeValue, JSXChild, JSXElement,
    JSXElementName, JSXExpression, JSXMemberExpressionObject, Statement,
};
use oxc_parser::Parser;
use oxc_span::SourceType;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use walkdir::WalkDir;

// ─── Public types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ViolationKind {
    /// The path does not match any page route in the manifest.
    UnknownPath,
    /// The path contains a literal `[param]` bracket — should use `params` prop instead.
    LiteralSegment,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RouteViolation {
    /// Absolute path to the file containing the violation.
    pub file: String,
    /// Byte offset of the string literal in the source.
    pub offset: u32,
    pub kind: ViolationKind,
    /// The problematic path string as written in source.
    pub path: String,
    /// Suggested fix, if applicable.
    pub suggestion: Option<String>,
}

// ─── Internal manifest types ──────────────────────────────────────────────────

#[derive(Deserialize)]
struct RouteEntry {
    path: String,
    kind: String,
    params: Vec<String>,
}

#[derive(Deserialize)]
struct ManifestJson {
    routes: Vec<RouteEntry>,
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/// Walk `app_dir` and validate all RouteLink/Link/navigate path references
/// against the route manifest produced by `build_routes()`.
///
/// `manifest_json` is the serialised `RouteManifest` JSON string.
pub fn check_route_refs(app_dir: &str, manifest_json: &str) -> Vec<RouteViolation> {
    let manifest: ManifestJson = match serde_json::from_str(manifest_json) {
        Ok(m) => m,
        Err(_) => return vec![],
    };

    // Only page routes are valid navigation targets.
    let page_routes: Vec<&RouteEntry> = manifest
        .routes
        .iter()
        .filter(|r| r.kind == "page")
        .collect();

    let mut all_violations = Vec::new();

    for entry in WalkDir::new(app_dir)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        if !matches!(ext, "ts" | "tsx") {
            continue;
        }
        // Route references in server files are never rendered to the DOM.
        let name = path.file_name().unwrap_or_default().to_str().unwrap_or("");
        if name.ends_with(".server.ts") || name.ends_with(".server.tsx") {
            continue;
        }

        let source = match std::fs::read_to_string(path) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let file_str = path.to_str().unwrap_or("");
        let violations = check_file_route_refs(&source, file_str, &page_routes);
        all_violations.extend(violations);
    }

    all_violations
}

// ─── Per-file checker ─────────────────────────────────────────────────────────

fn check_file_route_refs(
    source: &str,
    filename: &str,
    routes: &[&RouteEntry],
) -> Vec<RouteViolation> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(filename).unwrap_or_else(|_| SourceType::tsx());
    let parser_ret = Parser::new(&allocator, source, source_type).parse();

    // Skip files that fail to parse — compile errors are surfaced separately.
    if !parser_ret.errors.is_empty() {
        return vec![];
    }

    let mut collector = ViolationCollector {
        filename,
        routes,
        violations: Vec::new(),
    };

    for stmt in parser_ret.program.body.iter() {
        collector.walk_statement(stmt);
    }

    collector.violations
}

// ─── AST walker ───────────────────────────────────────────────────────────────

struct ViolationCollector<'a> {
    filename: &'a str,
    routes: &'a [&'a RouteEntry],
    violations: Vec<RouteViolation>,
}

impl<'a> ViolationCollector<'a> {
    fn walk_statement(&mut self, stmt: &Statement) {
        match stmt {
            Statement::ExpressionStatement(e) => self.walk_expression(&e.expression),
            Statement::ReturnStatement(r) => {
                if let Some(arg) = &r.argument {
                    self.walk_expression(arg);
                }
            }
            Statement::VariableDeclaration(v) => {
                for decl in v.declarations.iter() {
                    if let Some(init) = &decl.init {
                        self.walk_expression(init);
                    }
                }
            }
            Statement::FunctionDeclaration(f) => {
                if let Some(body) = &f.body {
                    for s in body.statements.iter() {
                        self.walk_statement(s);
                    }
                }
            }
            Statement::ExportNamedDeclaration(e) => {
                if let Some(decl) = &e.declaration {
                    match decl {
                        Declaration::VariableDeclaration(v) => {
                            for d in v.declarations.iter() {
                                if let Some(init) = &d.init {
                                    self.walk_expression(init);
                                }
                            }
                        }
                        Declaration::FunctionDeclaration(f) => {
                            if let Some(body) = &f.body {
                                for s in body.statements.iter() {
                                    self.walk_statement(s);
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            Statement::ExportDefaultDeclaration(e) => {
                match &e.declaration {
                    oxc_ast::ast::ExportDefaultDeclarationKind::FunctionDeclaration(f) => {
                        if let Some(body) = &f.body {
                            for s in body.statements.iter() {
                                self.walk_statement(s);
                            }
                        }
                    }
                    oxc_ast::ast::ExportDefaultDeclarationKind::ArrowFunctionExpression(arrow) => {
                        for s in arrow.body.statements.iter() {
                            self.walk_statement(s);
                        }
                    }
                    _ => {}
                }
            }
            Statement::IfStatement(i) => {
                self.walk_expression(&i.test);
                self.walk_statement(&i.consequent);
                if let Some(alt) = &i.alternate {
                    self.walk_statement(alt);
                }
            }
            Statement::BlockStatement(b) => {
                for s in b.body.iter() {
                    self.walk_statement(s);
                }
            }
            _ => {}
        }
    }

    fn walk_expression(&mut self, expr: &Expression) {
        match expr {
            Expression::JSXElement(jsx_el) => self.walk_jsx_element(jsx_el),
            Expression::CallExpression(call) => {
                // Check navigate("/path") calls.
                let is_navigate = matches!(
                    &call.callee,
                    Expression::Identifier(id) if id.name.as_str() == "navigate"
                );
                if is_navigate {
                    // In oxc 0.119, Argument uses inherit_variants! — StringLiteral
                    // is a direct variant (not wrapped in Argument::Expression).
                    if let Some(Argument::StringLiteral(lit)) = call.arguments.first() {
                        self.validate_path(lit.value.as_str(), lit.span.start);
                    }
                }
            }
            Expression::ArrowFunctionExpression(arrow) => {
                for s in arrow.body.statements.iter() {
                    self.walk_statement(s);
                }
            }
            Expression::FunctionExpression(f) => {
                if let Some(body) = &f.body {
                    for s in body.statements.iter() {
                        self.walk_statement(s);
                    }
                }
            }
            _ => {}
        }
    }

    fn walk_jsx_element(&mut self, jsx_el: &JSXElement) {
        let opening = &jsx_el.opening_element;
        let component_name = jsx_element_name_str(&opening.name);

        // Check RouteLink / Link `to` or `href` string literal attributes.
        if matches!(component_name.as_str(), "RouteLink" | "Link") {
            for attr_item in opening.attributes.iter() {
                if let JSXAttributeItem::Attribute(attr) = attr_item {
                    let attr_name = match &attr.name {
                        oxc_ast::ast::JSXAttributeName::Identifier(id) => {
                            id.name.as_str().to_string()
                        }
                        _ => continue,
                    };
                    if !matches!(attr_name.as_str(), "to" | "href") {
                        continue;
                    }
                    if let Some(JSXAttributeValue::StringLiteral(lit)) = &attr.value {
                        self.validate_path(lit.value.as_str(), lit.span.start);
                    }
                }
            }
        }

        // Recurse into JSX children.
        for child in jsx_el.children.iter() {
            match child {
                JSXChild::Element(child_el) => self.walk_jsx_element(child_el),
                JSXChild::ExpressionContainer(ec) => {
                    // In oxc 0.119, JSXExpression has an EmptyExpression variant and
                    // then all Expression variants flattened (via inherit_variants!).
                    // Match only the JSXElement variant to recurse into nested JSX.
                    if let JSXExpression::JSXElement(el) = &ec.expression {
                        self.walk_jsx_element(el);
                    }
                }
                _ => {}
            }
        }
    }

    fn validate_path(&mut self, path: &str, offset: u32) {
        // Only check absolute paths — relative, external, and anchor links are skipped.
        if !path.starts_with('/') {
            return;
        }

        // Literal `[param]` brackets in a path value — user likely forgot to use params.
        if bracket_re().is_match(path) {
            self.violations.push(RouteViolation {
                file: self.filename.to_string(),
                offset,
                kind: ViolationKind::LiteralSegment,
                path: path.to_string(),
                suggestion: Some(format!(
                    "Pass dynamic segments via the `params` prop: {path}"
                )),
            });
            return;
        }

        // Unknown path — not in the route manifest.
        if find_matching_route(path, self.routes).is_none() {
            self.violations.push(RouteViolation {
                file: self.filename.to_string(),
                offset,
                kind: ViolationKind::UnknownPath,
                path: path.to_string(),
                suggestion: suggest_close_route(path, self.routes),
            });
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn jsx_element_name_str(name: &JSXElementName) -> String {
    match name {
        JSXElementName::Identifier(id) => id.name.as_str().to_string(),
        JSXElementName::IdentifierReference(id) => id.name.as_str().to_string(),
        JSXElementName::MemberExpression(mem) => {
            let obj = match &mem.object {
                JSXMemberExpressionObject::IdentifierReference(id) => {
                    id.name.as_str().to_string()
                }
                JSXMemberExpressionObject::MemberExpression(inner) => {
                    inner.property.name.as_str().to_string()
                }
                JSXMemberExpressionObject::ThisExpression(_) => "this".to_string(),
            };
            format!("{}.{}", obj, mem.property.name.as_str())
        }
        JSXElementName::NamespacedName(ns) => {
            format!("{}:{}", ns.namespace.name.as_str(), ns.name.name.as_str())
        }
        JSXElementName::ThisExpression(_) => "this".to_string(),
    }
}

/// Convert an alab route pattern to a regex that matches concrete paths.
/// `/users/[id]` → matches `/users/123`, `/users/abc`, etc.
fn pattern_to_regex(pattern: &str) -> Regex {
    let escaped = regex::escape(pattern);
    let param_re = Regex::new(r"\\\[([^\]]+)\\\]").unwrap();
    let re_str = param_re.replace_all(&escaped, "[^/]+");
    Regex::new(&format!("^{re_str}$")).unwrap_or_else(|_| Regex::new("^$").unwrap())
}

fn find_matching_route<'a>(path: &str, routes: &[&'a RouteEntry]) -> Option<&'a RouteEntry> {
    for route in routes {
        if route.path == path {
            return Some(route);
        }
        if route.params.is_empty() {
            continue; // static route — already checked above
        }
        if pattern_to_regex(&route.path).is_match(path) {
            return Some(route);
        }
    }
    None
}

/// Return a route with a similar pattern as a suggestion (1-segment-off match).
fn suggest_close_route(path: &str, routes: &[&RouteEntry]) -> Option<String> {
    let path_parts: Vec<&str> = path.split('/').collect();
    let mut best: Option<(&RouteEntry, usize)> = None;

    for route in routes {
        let route_parts: Vec<&str> = route.path.split('/').collect();
        if route_parts.len() != path_parts.len() {
            continue;
        }
        let matching = route_parts
            .iter()
            .zip(path_parts.iter())
            .filter(|(rp, pp)| rp == pp || rp.starts_with('['))
            .count();
        if matching >= route_parts.len().saturating_sub(1)
            && best.as_ref().map_or(true, |(_, m)| matching > *m)
        {
            best = Some((route, matching));
        }
    }

    best.map(|(r, _)| r.path.clone())
}

fn bracket_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\[[^\]]+\]").unwrap())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_routes(defs: &[(&str, &[&str])]) -> Vec<RouteEntry> {
        defs.iter()
            .map(|(path, params)| RouteEntry {
                path: path.to_string(),
                kind: "page".to_string(),
                params: params.iter().map(|p| p.to_string()).collect(),
            })
            .collect()
    }

    fn refs<'a>(routes: &'a [RouteEntry]) -> Vec<&'a RouteEntry> {
        routes.iter().collect()
    }

    #[test]
    fn detects_unknown_path_in_route_link() {
        let source = r#"
import { RouteLink } from "alabjs/components";
export default function Page() {
  return <RouteLink to="/usr/123" />;
}
"#;
        let routes = make_routes(&[("/users/[id]", &["id"])]);
        let v = check_file_route_refs(source, "app/page.tsx", &refs(&routes));
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].kind, ViolationKind::UnknownPath);
        assert_eq!(v[0].path, "/usr/123");
    }

    #[test]
    fn accepts_valid_dynamic_path() {
        let source = r#"
export default function Page() {
  return <RouteLink to="/users/42" />;
}
"#;
        let routes = make_routes(&[("/users/[id]", &["id"])]);
        let v = check_file_route_refs(source, "app/page.tsx", &refs(&routes));
        assert!(v.is_empty(), "valid path should not produce violations: {v:?}");
    }

    #[test]
    fn detects_literal_bracket_in_route_link() {
        let source = r#"
export default function Page() {
  return <RouteLink to="/users/[id]" />;
}
"#;
        let routes = make_routes(&[("/users/[id]", &["id"])]);
        let v = check_file_route_refs(source, "app/page.tsx", &refs(&routes));
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].kind, ViolationKind::LiteralSegment);
    }

    #[test]
    fn detects_unknown_path_in_navigate() {
        let source = r#"
import { navigate } from "alabjs/router";
function go() { navigate("/nowhere"); }
"#;
        let routes = make_routes(&[("/", &[])]);
        let v = check_file_route_refs(source, "app/page.tsx", &refs(&routes));
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].kind, ViolationKind::UnknownPath);
    }

    #[test]
    fn accepts_valid_static_path_in_navigate() {
        let source = r#"
function go() { navigate("/about"); }
"#;
        let routes = make_routes(&[("/about", &[])]);
        let v = check_file_route_refs(source, "app/page.tsx", &refs(&routes));
        assert!(v.is_empty());
    }

    #[test]
    fn skips_relative_paths() {
        let source = r#"
export default function Page() {
  return <RouteLink to="relative/path" />;
}
"#;
        let routes = make_routes(&[("/about", &[])]);
        let v = check_file_route_refs(source, "app/page.tsx", &refs(&routes));
        assert!(v.is_empty(), "relative paths should be ignored");
    }

    #[test]
    fn accepts_root_path() {
        let source = r#"
export default function Page() {
  return <Link href="/" />;
}
"#;
        let routes = make_routes(&[("/", &[])]);
        let v = check_file_route_refs(source, "app/page.tsx", &refs(&routes));
        assert!(v.is_empty());
    }
}
