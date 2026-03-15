use oxc_allocator::Allocator;
use oxc_ast::ast::Statement;
use oxc_parser::Parser;
use oxc_span::SourceType;
use serde::{Deserialize, Serialize};

/// A detected server-boundary violation.
#[derive(Debug, Serialize, Deserialize)]
pub struct BoundaryViolation {
    /// The `.server.ts` module that was illegally imported.
    pub import: String,
    /// The file containing the illegal import.
    pub source: String,
    /// Byte offset of the offending import statement.
    pub offset: u32,
}

/// Check whether a client file (`.page.tsx` / browser context)
/// directly imports a `.server.ts` module.
///
/// The full transitive graph walk is done at the Node.js layer.
/// This function checks only a single file's direct imports.
pub fn check_server_boundary(
    source: &str,
    filename: &str,
) -> Vec<BoundaryViolation> {
    if !is_client_context(filename) {
        return vec![];
    }

    let allocator = Allocator::default();
    let source_type = SourceType::from_path(filename).unwrap_or_else(|_| SourceType::tsx());
    let parser_ret = Parser::new(&allocator, source, source_type).parse();

    // parse errors are surfaced by compile(); skip here
    if !parser_ret.errors.is_empty() {
        return vec![];
    }

    let mut violations = Vec::new();

    for stmt in parser_ret.program.body.iter() {
        if let Statement::ImportDeclaration(decl) = stmt {
            let specifier = decl.source.value.as_str();
            if is_server_module(specifier) {
                violations.push(BoundaryViolation {
                    import: specifier.to_string(),
                    source: filename.to_string(),
                    offset: decl.span.start,
                });
            }
        }
    }

    violations
}

fn is_client_context(filename: &str) -> bool {
    !filename.contains(".server.")
}

fn is_server_module(specifier: &str) -> bool {
    specifier.ends_with(".server")
        || specifier.ends_with(".server.ts")
        || specifier.ends_with(".server.tsx")
        || specifier.ends_with(".server.js")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_server_import_in_client_file() {
        let source = r#"import { getUser } from "./user.server";"#;
        let violations = check_server_boundary(source, "user.page.tsx");
        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].import, "./user.server");
    }

    #[test]
    fn allows_server_import_in_server_file() {
        let source = r#"import { db } from "./db.server";"#;
        let violations = check_server_boundary(source, "actions.server.ts");
        assert!(violations.is_empty());
    }

    #[test]
    fn no_violation_for_regular_imports() {
        let source = r#"import React from "react"; import { useState } from "react";"#;
        let violations = check_server_boundary(source, "page.tsx");
        assert!(violations.is_empty());
    }
}
