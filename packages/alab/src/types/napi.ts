/**
 * Minimal interface for the @alab/compiler napi binding.
 * Loaded dynamically at runtime — no static import needed.
 */
export interface AlabNapi {
  compileSource(source: string, filename: string, minify: boolean): string;
  checkBoundary(source: string, filename: string): string;
  buildRoutes(appDir: string): string;
}
