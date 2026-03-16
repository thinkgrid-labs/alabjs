/**
 * Server-only image utilities.
 *
 * Import from "alabjs/components/server" — do NOT import from "alabjs/components"
 * because this file uses Node.js built-ins (fs, path) and must never be bundled
 * for the browser.
 */

/**
 * Generate a Base64 blur-up placeholder for an image in `public/`.
 *
 * Calls the Rust napi binding to resize the image to 8px wide and encode it
 * as a tiny WebP, then Base64-encodes it into a data URL ready for `blurDataURL`.
 *
 * Run this in a server function — it reads from disk and must not run in the browser.
 *
 * @param src - Path relative to `public/` (e.g. `"/hero.jpg"`)
 * @param publicDir - Absolute path to the `public/` directory
 */
export async function generateBlurPlaceholder(
  src: string,
  publicDir: string,
): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");

  const safeSrc = src.replace(/\.\./g, "").replace(/^\/+/, "");
  const filePath = resolve(publicDir, safeSrc);

  const input = await readFile(filePath);

  let napi: { optimizeImage: (b: Buffer, q: number | null, w: number | null, h: null, fmt: string) => Promise<Buffer> };
  try {
    napi = (await import("@alabjs/compiler")) as typeof napi;
  } catch {
    // napi not built — return empty string (image still loads, just no blur effect)
    return "";
  }

  const tiny = await napi.optimizeImage(input, 40, 8, null, "webp");
  const b64 = Buffer.from(tiny).toString("base64");
  return `data:image/webp;base64,${b64}`;
}
