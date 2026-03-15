import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AlabNapi } from "../types/napi.js";

/**
 * Handle `/_alabjs/image` requests using the Rust image optimiser (alab-napi).
 *
 * Node.js reads the source file from `public/` then passes the raw bytes to
 * Rust — same pattern as snapbolt-cli. Rust decodes, resizes, and encodes to
 * WebP (libwebp-sys with `native` feature, or pure-Rust fallback).
 *
 * Query params:
 *   src    — path relative to the project's `public/` directory (required)
 *   w      — target width in pixels (required)
 *   q      — quality 1–100 (default: 80)
 *   fmt    — "webp" (default) | "jpeg" | "png"
 *
 * Cache-Control is set to 1 year / immutable for optimised responses.
 */
export async function handleImageRequest(
  req: IncomingMessage,
  res: ServerResponse,
  publicDir: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const src = url.searchParams.get("src");
  const wParam = url.searchParams.get("w");
  const quality = Math.max(1, Math.min(100, parseInt(url.searchParams.get("q") ?? "80", 10)));
  const fmt = url.searchParams.get("fmt") ?? "webp";

  if (!src || !wParam) {
    res.statusCode = 400;
    res.end("[alab] Missing src or w parameter");
    return;
  }

  const width = parseInt(wParam, 10);
  if (!Number.isFinite(width) || width < 1 || width > 4096) {
    res.statusCode = 400;
    res.end("[alab] Invalid width — must be 1–4096");
    return;
  }

  // Prevent path traversal
  const safeSrc = src.replace(/\.\./g, "").replace(/^\/+/, "");
  const filePath = resolve(publicDir, safeSrc);
  if (!filePath.startsWith(publicDir)) {
    res.statusCode = 403;
    res.end("[alab] Forbidden");
    return;
  }

  try {
    await access(filePath);
  } catch {
    res.statusCode = 404;
    res.end("[alab] Image not found");
    return;
  }

  const input = await readFile(filePath);

  // Load napi binding (built by `cargo build --release -p alab-napi`).
  // Fall back to serving the raw file when the binary isn't available so that
  // images still load during development without the Rust toolchain.
  let napi: AlabNapi | null = null;
  try {
    const mod = await import("@alabjs/compiler") as { default?: AlabNapi } & AlabNapi;
    napi = (mod.default ?? mod) as AlabNapi;
  } catch {
    // napi not built — will serve raw file below.
  }

  if (!napi) {
    const ext = safeSrc.split(".").pop()?.toLowerCase() ?? "";
    const mime =
      ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "png"                  ? "image/png"
      : ext === "gif"                  ? "image/gif"
      : ext === "webp"                 ? "image/webp"
      : ext === "avif"                 ? "image/avif"
      :                                  "application/octet-stream";
    res.statusCode = 200;
    res.setHeader("content-type", mime);
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-length", input.length);
    res.end(input);
    return;
  }

  try {
    // Pass raw bytes to Rust — decode + resize + encode on a blocking thread pool.
    const optimised = await napi.optimizeImage(input, quality, width, undefined, fmt);

    const mime =
      fmt === "jpeg" || fmt === "jpg" ? "image/jpeg"
      : fmt === "png"                 ? "image/png"
      :                                 "image/webp";

    res.statusCode = 200;
    res.setHeader("content-type", mime);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.setHeader("content-length", optimised.length);
    res.end(optimised);
  } catch (err) {
    console.error("[alab] image optimisation error:", err);
    res.statusCode = 500;
    res.end("[alab] Image optimisation failed");
  }
}
