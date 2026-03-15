declare module "@alab/compiler" {
  export function compileSource(source: string, filename: string, minify: boolean): string;
  export function checkBoundary(source: string, filename: string): string;
  export function buildRoutes(appDir: string): string;
  export function optimizeImage(
    input: Buffer,
    quality?: number | null,
    width?: number | null,
    height?: number | null,
    format?: string | null,
  ): Promise<Buffer>;
  export function extractServerFns(source: string, filename: string): string;
  export function serverFnStub(name: string, endpoint: string): string;
}
