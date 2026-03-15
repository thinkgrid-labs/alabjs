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
