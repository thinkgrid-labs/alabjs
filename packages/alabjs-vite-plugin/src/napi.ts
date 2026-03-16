/** Minimal interface for the @alabjs/compiler napi binding. */
export interface AlabNapi {
  compileSource(source: string, filename: string, minify: boolean, sourceMap: boolean): string;
  checkBoundary(source: string, filename: string): string;
  buildRoutes(appDir: string): string;
  optimizeImage(
    input: Buffer,
    quality?: number | null,
    width?: number | null,
    height?: number | null,
    format?: string | null,
  ): Promise<Buffer>;
  /** Returns JSON `Array<{ name: string; endpoint: string }>` */
  extractServerFns(source: string, filename: string): string;
  /** Returns an ES module stub replacing the real handler in client bundles. */
  serverFnStub(name: string, endpoint: string): string;
  /**
   * FNV-1a 64-bit hash of `content`, returned as a 16-char lowercase hex string.
   * Used by the build pipeline to derive a content-addressed build ID.
   */
  hashBuildId(content: string): string;
}
