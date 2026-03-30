pub mod error;
pub mod transform;
pub mod boundary;
pub mod image_opt;
pub mod extractor;
pub mod directive;
pub mod route_checker;

pub use error::CompilerError;
pub use transform::{CompileOptions, CompileOutput, compile};
pub use boundary::{BoundaryViolation, check_server_boundary};
pub use image_opt::{optimize_buffer, OptimizeOptions, OutputFormat, OptimizerError};
pub use extractor::{ServerFn, extract_server_fns, server_fn_client_stub};
pub use directive::{DirectiveKind, DirectiveInfo, detect_directive};
pub use route_checker::{ViolationKind, RouteViolation, check_route_refs};
