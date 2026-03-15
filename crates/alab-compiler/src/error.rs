use thiserror::Error;

#[derive(Debug, Error)]
pub enum CompilerError {
    #[error("Parse error in {file}: {message}")]
    ParseError { file: String, message: String },

    #[error("Server boundary violation: `{import}` is a server module imported in client context `{file}`")]
    BoundaryViolation { import: String, file: String },

    #[error("Transform error in {file}: {message}")]
    TransformError { file: String, message: String },
}
