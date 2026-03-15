#![deny(clippy::all)]

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use alab_compiler::{
    compile, check_server_boundary, CompileOptions,
    optimize_buffer, OptimizeOptions, OutputFormat,
};
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

/// Optimise a single image buffer — same interface as snapbolt-cli.
///
/// Runs on a Tokio blocking thread so it never blocks the Node.js event loop,
/// keeping the server at full throughput even during heavy image processing.
///
/// - `input`   — raw image bytes (JPEG, PNG, GIF, or WebP)
/// - `quality` — 1.0–100.0, defaults to 80
/// - `width`   — target width in pixels; omit to keep original width
/// - `height`  — target height in pixels; omit to keep original height
/// - `format`  — `"webp"` (default), `"jpeg"`, or `"png"`
///
/// WebP encoding uses libwebp-sys when the crate is compiled with
/// `--features native`; otherwise falls back to the pure-Rust encoder.
/// Returns a Promise that resolves to the encoded bytes as a Node.js `Buffer`.
#[napi]
pub async fn optimize_image(
    input: Buffer,
    quality: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    format: Option<String>,
) -> napi::Result<Buffer> {
    let fmt = match format.as_deref() {
        Some("jpeg") | Some("jpg") => OutputFormat::Jpeg,
        Some("png")                => OutputFormat::Png,
        _                          => OutputFormat::WebP,
    };
    let options = OptimizeOptions {
        quality: quality.unwrap_or(80.0) as f32,
        width,
        height,
        format: fmt,
    };
    // Move CPU-intensive work off the event loop thread.
    let data: Vec<u8> = input.to_vec();
    let result = tokio::task::spawn_blocking(move || optimize_buffer(&data, &options))
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    match result {
        Ok((bytes, _mime)) => Ok(bytes.into()),
        Err(e)             => Err(napi::Error::from_reason(e.to_string())),
    }
}
