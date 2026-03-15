use std::path::{Path, PathBuf};

use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_transformer::{TransformOptions, Transformer};
use serde::{Deserialize, Serialize};

use crate::CompilerError;

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileOptions {
    /// Absolute path of the file being compiled.
    pub filename: String,
    #[serde(default)]
    pub source_map: bool,
    #[serde(default)]
    pub minify: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileOutput {
    pub code: String,
    pub map: Option<String>,
}

/// Compile a TypeScript/TSX source string to JavaScript.
///
/// Pipeline: parse → semantic → transform (JSX + TS strip) → codegen.
pub fn compile(source: &str, options: &CompileOptions) -> Result<CompileOutput, CompilerError> {
    let allocator = Allocator::default();

    let source_type = SourceType::from_path(&options.filename)
        .unwrap_or_else(|_| SourceType::tsx());

    // 1. Parse
    let parser_ret = Parser::new(&allocator, source, source_type).parse();
    if !parser_ret.errors.is_empty() {
        let message = parser_ret
            .errors
            .iter()
            .map(|e| e.to_string())
            .collect::<Vec<_>>()
            .join("\n");
        return Err(CompilerError::ParseError {
            file: options.filename.clone(),
            message,
        });
    }

    let mut program = parser_ret.program;

    // 2. Semantic analysis (required by oxc_transformer 0.100+)
    let scoping = SemanticBuilder::new()
        .build(&program)
        .semantic
        .into_scoping();

    // 3. Transform
    let transform_options = TransformOptions::enable_all();
    let transform_ret = Transformer::new(
        &allocator,
        Path::new(&options.filename),
        &transform_options,
    )
    .build_with_scoping(scoping, &mut program);

    if !transform_ret.errors.is_empty() {
        let message = transform_ret
            .errors
            .iter()
            .map(|e| e.to_string())
            .collect::<Vec<_>>()
            .join("\n");
        return Err(CompilerError::TransformError {
            file: options.filename.clone(),
            message,
        });
    }

    // 4. Codegen — enable source map when requested
    let codegen_opts = if options.source_map {
        CodegenOptions {
            source_map_path: Some(PathBuf::from(&options.filename)),
            ..Default::default()
        }
    } else {
        CodegenOptions::default()
    };

    let ret = Codegen::new().with_options(codegen_opts).build(&program);
    let map_json = ret.map.map(|sm| sm.to_json_string());

    Ok(CompileOutput { code: ret.code, map: map_json })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_typescript_types() {
        let source = "const x: number = 42;";
        let opts = CompileOptions {
            filename: "test.ts".into(),
            source_map: false,
            minify: false,
        };
        let out = compile(source, &opts).unwrap();
        assert!(out.code.contains("const x = 42"));
        assert!(!out.code.contains(": number"));
    }

    #[test]
    fn transforms_jsx() {
        let source = r#"const el = <div className="foo">hello</div>;"#;
        let opts = CompileOptions {
            filename: "test.tsx".into(),
            source_map: false,
            minify: false,
        };
        let out = compile(source, &opts).unwrap();
        assert!(
            out.code.contains("_jsx") || out.code.contains("createElement") || out.code.contains("jsx"),
            "Expected JSX transform in output:\n{}",
            out.code
        );
    }
}
