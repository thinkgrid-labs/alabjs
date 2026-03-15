use oxc_allocator::Allocator;
use oxc_ast::ast::{BindingPattern, Declaration, Expression, Statement};
use oxc_parser::Parser;
use oxc_span::SourceType;
use serde::{Deserialize, Serialize};

/// A server function detected in a `.server.ts` file.
#[derive(Debug, Serialize, Deserialize)]
pub struct ServerFn {
    /// Exported binding name (e.g. `"getUser"`).
    pub name: String,
    /// The `/_alabjs/fn/<name>` HTTP endpoint registered at runtime.
    pub endpoint: String,
}

/// Scan a source file for `export const NAME = defineServerFn(handler)` patterns.
///
/// Returns one [`ServerFn`] per detected declaration.  Only direct top-level
/// `export const` statements whose initialiser is a bare `defineServerFn(...)`
/// call are recognised — method-call and nested forms are intentionally ignored
/// to keep the extractor simple and predictable.
pub fn extract_server_fns(source: &str, filename: &str) -> Vec<ServerFn> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(filename).unwrap_or_else(|_| SourceType::ts());
    let parser_ret = Parser::new(&allocator, source, source_type).parse();

    // Surface parse errors through the compile step; return empty here.
    if !parser_ret.errors.is_empty() {
        return vec![];
    }

    let mut fns = Vec::new();

    for stmt in parser_ret.program.body.iter() {
        let Statement::ExportNamedDeclaration(export_decl) = stmt else {
            continue;
        };
        let Some(Declaration::VariableDeclaration(var_decl)) = &export_decl.declaration else {
            continue;
        };

        for declarator in var_decl.declarations.iter() {
            // Binding must be a plain identifier — destructuring is not supported.
            let BindingPattern::BindingIdentifier(ident) = &declarator.id else {
                continue;
            };
            let Some(init) = &declarator.init else {
                continue;
            };
            let Expression::CallExpression(call) = init else {
                continue;
            };

            // Callee must be the bare identifier `defineServerFn`.
            let is_define = match &call.callee {
                Expression::Identifier(id) => id.name.as_str() == "defineServerFn",
                _ => false,
            };
            if !is_define {
                continue;
            }

            let name = ident.name.to_string();
            let endpoint = format!("/_alabjs/fn/{name}");
            fns.push(ServerFn { name, endpoint });
        }
    }

    fns
}

/// Generate a client-side stub for a server function.
///
/// The stub is injected into client bundles in place of the real handler so
/// that server code (DB calls, secrets, etc.) never ships to the browser.
///
/// At runtime the stub issues a `POST /_alabjs/fn/<name>` request and returns
/// the JSON response — exactly what the AlabJS production server handles.
pub fn server_fn_client_stub(name: &str, endpoint: &str) -> String {
    format!(
        r#"export const {name} = async (input) => {{
  const res = await fetch("{endpoint}", {{
    method: "POST",
    headers: {{ "Content-Type": "application/json" }},
    body: JSON.stringify(input ?? null),
  }});
  if (!res.ok) throw new Error(`[alabjs] server fn '{name}' failed: ${{res.status}}`);
  return res.json();
}};
"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_single_server_fn() {
        let src = r#"
import { defineServerFn } from "alabjs/server";
export const getUser = defineServerFn(async ({ params }) => {
    return { id: params.id };
});
"#;
        let fns = extract_server_fns(src, "user.server.ts");
        assert_eq!(fns.len(), 1);
        assert_eq!(fns[0].name, "getUser");
        assert_eq!(fns[0].endpoint, "/_alabjs/fn/getUser");
    }

    #[test]
    fn detects_multiple_server_fns() {
        let src = r#"
export const getUser = defineServerFn(async () => {});
export const listUsers = defineServerFn(async () => {});
export const deleteUser = defineServerFn(async () => {});
"#;
        let fns = extract_server_fns(src, "users.server.ts");
        assert_eq!(fns.len(), 3);
        assert_eq!(fns[0].name, "getUser");
        assert_eq!(fns[1].name, "listUsers");
        assert_eq!(fns[2].name, "deleteUser");
    }

    #[test]
    fn ignores_non_define_server_fn_calls() {
        let src = r#"
export const helper = someOtherFn(async () => {});
export const getUser = defineServerFn(async () => {});
"#;
        let fns = extract_server_fns(src, "utils.server.ts");
        assert_eq!(fns.len(), 1);
        assert_eq!(fns[0].name, "getUser");
    }

    #[test]
    fn returns_empty_on_parse_error() {
        let src = "this is {{ not valid typescript }{{{";
        let fns = extract_server_fns(src, "bad.server.ts");
        assert!(fns.is_empty());
    }

    #[test]
    fn stub_output_contains_endpoint() {
        let stub = server_fn_client_stub("getUser", "/_alabjs/fn/getUser");
        assert!(stub.contains("export const getUser"));
        assert!(stub.contains("/_alabjs/fn/getUser"));
        assert!(stub.contains("POST"));
    }
}
