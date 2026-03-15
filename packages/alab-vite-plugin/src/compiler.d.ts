declare module "@alab/compiler" {
  export function compileSource(source: string, filename: string, minify: boolean): string;
  export function checkBoundary(source: string, filename: string): string;
  export function buildRoutes(appDir: string): string;
}
