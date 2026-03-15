/**
 * Compile a TypeScript / TSX source string to JavaScript.
 *
 * @param source - Raw TypeScript/TSX source code
 * @param filename - Absolute or relative file path (used for source maps and JSX detection)
 * @param minify - Whether to minify the output
 * @returns JSON string `{ code: string, map: string | null }`
 */
export declare function compileSource(source: string, filename: string, minify: boolean): string

/**
 * Check a source file for server-boundary violations.
 *
 * Runtime imports (`import { x }`) of `.server.ts` modules in client
 * files are violations. Type-only imports (`import type { x }`) are allowed.
 *
 * @param source - Raw TypeScript/TSX source code
 * @param filename - File path (used to determine if the file is a client context)
 * @returns JSON string `Array<{ import: string; source: string; offset: number }>`
 */
export declare function checkBoundary(source: string, filename: string): string

/**
 * Scan an `app/` directory and build the route manifest.
 *
 * @param appDir - Absolute path to the `app/` directory
 * @returns JSON string `{ routes: Route[] }`
 */
export declare function buildRoutes(appDir: string): string

/**
 * Optimise a single image buffer — same interface as snapbolt-cli.
 *
 * Decodes JPEG / PNG / GIF / WebP, resizes to `width` × `height` (aspect
 * ratio preserved, never upscaled), and encodes to the requested format.
 *
 * WebP encoding uses libwebp-sys when compiled with `--features native`;
 * otherwise falls back to the pure-Rust encoder in the `image` crate.
 *
 * @param input   - Raw image bytes
 * @param quality - 1–100, defaults to 80
 * @param width   - Target width in px; omit to keep original
 * @param height  - Target height in px; omit to keep original
 * @param format  - "webp" (default) | "jpeg" | "png"
 * @returns Encoded image bytes as a Node.js Buffer
 */
export declare function optimizeImage(
  input: Buffer,
  quality?: number | null,
  width?: number | null,
  height?: number | null,
  format?: string | null,
): Buffer
