use oxc_allocator::Allocator;
use oxc_ast::ast::{Expression, Statement};
use oxc_parser::Parser;
use oxc_span::SourceType;
use serde::{Deserialize, Serialize};

/// The directive found at the top of a source file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DirectiveKind {
    /// `"use live"` — server-rendered, SSE-pushed live component.
    UseLive,
    /// `"use client"` — explicit client boundary marker.
    UseClient,
    /// No recognised directive present.
    None,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirectiveInfo {
    pub kind: DirectiveKind,
    /// Byte offset of the directive string literal (0 when kind is None).
    pub offset: u32,
}

/// Detect `"use live"` or `"use client"` in a source file.
///
/// Per the React convention, directives must appear as the very first statement
/// of the module body. This function is O(1) — it inspects only the leading
/// `program.directives` list (where oxc puts leading string-literal prologue
/// statements) and, as a fallback, the first `ExpressionStatement` in
/// `program.body`.
///
/// Returns `DirectiveInfo { kind: None, offset: 0 }` on any parse error or
/// when no recognised directive is found.
pub fn detect_directive(source: &str, filename: &str) -> DirectiveInfo {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(filename).unwrap_or_else(|_| SourceType::tsx());
    let parser_ret = Parser::new(&allocator, source, source_type).parse();

    if !parser_ret.errors.is_empty() {
        return DirectiveInfo { kind: DirectiveKind::None, offset: 0 };
    }

    let program = &parser_ret.program;

    // oxc places leading string-literal prologue statements in program.directives
    // (e.g. "use strict"). "use live" / "use client" follow the same syntax so
    // they should appear here in most cases.
    for directive in program.directives.iter() {
        let kind = match directive.expression.value.as_str() {
            "use live" => DirectiveKind::UseLive,
            "use client" => DirectiveKind::UseClient,
            _ => continue,
        };
        return DirectiveInfo { kind, offset: directive.span.start };
    }

    // Fallback: check the first expression statement in case the parser put it
    // in the body instead of the directives list.
    if let Some(stmt) = program.body.first() {
        if let Statement::ExpressionStatement(expr_stmt) = stmt {
            if let Expression::StringLiteral(lit) = &expr_stmt.expression {
                let kind = match lit.value.as_str() {
                    "use live" => DirectiveKind::UseLive,
                    "use client" => DirectiveKind::UseClient,
                    _ => DirectiveKind::None,
                };
                if kind != DirectiveKind::None {
                    return DirectiveInfo { kind, offset: expr_stmt.span.start };
                }
            }
        }
    }

    DirectiveInfo { kind: DirectiveKind::None, offset: 0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_use_live() {
        let src = r#""use live";
export default function Price() { return <span>42</span>; }"#;
        let info = detect_directive(src, "Price.live.tsx");
        assert_eq!(info.kind, DirectiveKind::UseLive);
    }

    #[test]
    fn detects_use_client() {
        let src = r#""use client";
export default function Button() { return <button>click</button>; }"#;
        let info = detect_directive(src, "Button.tsx");
        assert_eq!(info.kind, DirectiveKind::UseClient);
    }

    #[test]
    fn returns_none_for_no_directive() {
        let src = r#"export default function Page() { return <div/>; }"#;
        let info = detect_directive(src, "page.tsx");
        assert_eq!(info.kind, DirectiveKind::None);
    }

    #[test]
    fn returns_none_for_other_string_literal() {
        let src = r#""use strict";
export default function Page() { return <div/>; }"#;
        let info = detect_directive(src, "page.tsx");
        assert_eq!(info.kind, DirectiveKind::None);
    }

    #[test]
    fn returns_none_on_parse_error() {
        let src = "this is {{ not valid typescript }{{{";
        let info = detect_directive(src, "bad.tsx");
        assert_eq!(info.kind, DirectiveKind::None);
    }

    #[test]
    fn directive_must_be_first_statement() {
        // A "use live" that is NOT the first statement should not be detected.
        let src = r#"import React from "react";
"use live";
export default function Price() { return <span/>; }"#;
        let info = detect_directive(src, "Price.tsx");
        assert_eq!(info.kind, DirectiveKind::None);
    }
}
