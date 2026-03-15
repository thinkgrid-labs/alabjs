/**
 * Minimal interface for the @alab/compiler napi binding.
 * Loaded dynamically at runtime — no static import needed.
 */
export interface AlabNapi {
  compileSource(source: string, filename: string, minify: boolean): string;
  checkBoundary(source: string, filename: string): string;
  buildRoutes(appDir: string): string;
  optimizeImage(
    input: Buffer,
    quality?: number | null,
    width?: number | null,
    height?: number | null,
    format?: string | null,
  ): Buffer;
}
