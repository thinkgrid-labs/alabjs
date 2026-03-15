#![deny(clippy::all)]

use napi_derive::napi;
use alab_compiler::{compile, check_server_boundary, CompileOptions};
use alab_router::scan_routes;

/// Compile a TypeScript / TSX source string to JavaScript.
///
/// Returns a JSON string `{ code: string, map: string | null }`.
#[napi]
pub fn compile_source(source: String, filename: String, minify: bool) -> napi::Result<String> {
    let opts = CompileOptions { filename, source_map: false, minify };
    let output = compile(&source, &opts)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&output)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Check a source file for server-boundary violations.
///
/// Returns a JSON array of `{ import, source, offset }` objects.
/// An empty array means no violations.
#[napi]
pub fn check_boundary(source: String, filename: String) -> napi::Result<String> {
    let violations = check_server_boundary(&source, &filename);
    serde_json::to_string(&violations)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// Scan an `app/` directory and return the full route manifest as JSON.
///
/// Returns `{ routes: Route[] }`.
#[napi]
pub fn build_routes(app_dir: String) -> napi::Result<String> {
    let manifest = scan_routes(&app_dir);
    serde_json::to_string(&manifest)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}
