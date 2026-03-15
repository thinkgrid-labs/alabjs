/**
 * Type declaration for the @alab/compiler native binding.
 * The actual module is a napi-rs .node binary loaded at runtime.
 * It is an optional dependency — the framework falls back to esbuild if absent.
 */
declare module "@alab/compiler" {
  /** Compile a TypeScript/TSX source string to JavaScript. Returns JSON `{ code, map }`. */
  export function compileSource(source: string, filename: string, minify: boolean): string;
  /** Check a source file for server-boundary violations. Returns JSON array. */
  export function checkBoundary(source: string, filename: string): string;
  /** Scan an app/ directory and build the route manifest. Returns JSON `{ routes }`. */
  export function buildRoutes(appDir: string): string;
  /** Optimise an image buffer — decode, resize, and encode to WebP/JPEG/PNG. */
  export function optimizeImage(
    input: Buffer,
    quality?: number | null,
    width?: number | null,
    height?: number | null,
    format?: string | null,
  ): Buffer;
}
