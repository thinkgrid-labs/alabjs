//! Rust-powered image optimisation — adapted from snapbolt-core.
//!
//! `optimize_buffer` takes raw image bytes (JPEG, PNG, GIF, or WebP),
//! optionally resizes them, and encodes the result to the requested format.
//!
//! WebP output uses libwebp-sys when compiled with `--features native`
//! (same as snapbolt-core); otherwise falls back to the `image` crate's
//! pure-Rust WebP encoder so the crate remains wasm32-compatible.

use image::imageops::FilterType;
use std::io::Cursor;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum OptimizerError {
    #[error("Failed to decode image: {0}")]
    DecodeError(String),
    #[error("Failed to encode image: {0}")]
    EncodeError(String),
    #[error("Unsupported format")]
    UnsupportedFormat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum OutputFormat {
    #[default]
    WebP,
    Jpeg,
    Png,
}

pub struct OptimizeOptions {
    pub quality: f32,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: OutputFormat,
}

impl Default for OptimizeOptions {
    fn default() -> Self {
        Self {
            quality: 80.0,
            width: None,
            height: None,
            format: OutputFormat::default(),
        }
    }
}

/// Optimise an image buffer. Returns `(encoded_bytes, mime_type)`.
///
/// This is the same interface as `snapbolt_core::optimize_buffer`.
pub fn optimize_buffer(
    input: &[u8],
    options: &OptimizeOptions,
) -> Result<(Vec<u8>, &'static str), OptimizerError> {
    // Decode — auto-detects JPEG, PNG, GIF, WebP.
    let img = image::load_from_memory(input)
        .map_err(|e| OptimizerError::DecodeError(e.to_string()))?;

    // Resize while preserving aspect ratio (Lanczos3 = high quality).
    // Never upscales — the `image` crate respects the original dimensions.
    let img = match (options.width, options.height) {
        (Some(w), Some(h)) => img.resize(w, h, FilterType::Lanczos3),
        (Some(w), None)    => img.resize(w, u32::MAX, FilterType::Lanczos3),
        (None, Some(h))    => img.resize(u32::MAX, h, FilterType::Lanczos3),
        (None, None)       => img,
    };

    match options.format {
        OutputFormat::WebP => {
            // native feature: high-quality lossy WebP via libwebp-sys.
            #[cfg(feature = "native")]
            {
                let encoder = webp::Encoder::from_image(&img)
                    .map_err(|e| OptimizerError::EncodeError(e.to_string()))?;
                let memory = encoder.encode(options.quality);
                Ok((memory.to_vec(), "image/webp"))
            }
            // Fallback: pure-Rust WebP encoder from the image crate.
            #[cfg(not(feature = "native"))]
            {
                let mut out = Cursor::new(Vec::new());
                img.write_to(&mut out, image::ImageFormat::WebP)
                    .map_err(|e| OptimizerError::EncodeError(e.to_string()))?;
                Ok((out.into_inner(), "image/webp"))
            }
        }

        OutputFormat::Jpeg => {
            let mut out = Cursor::new(Vec::new());
            let quality = options.quality.clamp(1.0, 100.0) as u8;
            let mut encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality);
            encoder
                .encode_image(&img)
                .map_err(|e| OptimizerError::EncodeError(e.to_string()))?;
            Ok((out.into_inner(), "image/jpeg"))
        }

        OutputFormat::Png => {
            let mut out = Cursor::new(Vec::new());
            img.write_to(&mut out, image::ImageFormat::Png)
                .map_err(|e| OptimizerError::EncodeError(e.to_string()))?;
            Ok((out.into_inner(), "image/png"))
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // Minimal 1×1 red pixel PNG (same test fixture as snapbolt-core).
    const MINIMAL_PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
        0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8,
        0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB0, 0x00, 0x00, 0x00,
        0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    #[test]
    fn encodes_png_to_webp() {
        let opts = OptimizeOptions::default();
        let (data, mime) = optimize_buffer(MINIMAL_PNG, &opts).unwrap();
        assert_eq!(mime, "image/webp");
        assert!(!data.is_empty());
    }

    #[test]
    fn encodes_png_to_jpeg() {
        let opts = OptimizeOptions { format: OutputFormat::Jpeg, quality: 75.0, ..Default::default() };
        let (data, mime) = optimize_buffer(MINIMAL_PNG, &opts).unwrap();
        assert_eq!(mime, "image/jpeg");
        assert_eq!(&data[0..2], &[0xFF, 0xD8]); // JPEG SOI marker
    }

    #[test]
    fn encodes_png_to_png() {
        let opts = OptimizeOptions { format: OutputFormat::Png, ..Default::default() };
        let (data, mime) = optimize_buffer(MINIMAL_PNG, &opts).unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(&data[0..4], &[0x89, 0x50, 0x4E, 0x47]); // PNG magic
    }

    #[test]
    fn resize_with_width() {
        let opts = OptimizeOptions { width: Some(1), ..Default::default() };
        let result = optimize_buffer(MINIMAL_PNG, &opts);
        assert!(result.is_ok());
    }

    #[test]
    fn rejects_invalid_bytes() {
        let opts = OptimizeOptions::default();
        let result = optimize_buffer(&[0x00, 0x01, 0x02, 0x03], &opts);
        assert!(matches!(result, Err(OptimizerError::DecodeError(_))));
    }
}
