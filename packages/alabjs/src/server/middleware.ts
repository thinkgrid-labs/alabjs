/**
 * Middleware runner — loads and executes the user's `middleware.ts` file.
 *
 * Convention (mirrors Next.js):
 * ```ts
 * // middleware.ts (project root)
 * export async function middleware(req: Request): Promise<Response | void> {
 *   if (!isAuthed(req)) return Response.redirect(new URL("/login", req.url));
 *   // return nothing (or return NextResponse.next()) to continue
 * }
 *
 * // Optional — restrict which paths the middleware runs on.
 * // Patterns support * and ** wildcards (like path-to-regexp lite).
 * export const config = {
 *   matcher: ["/dashboard/:path*", "/api/:path*"],
 * };
 * ```
 */

// ─── Public helpers (importable from "alabjs/middleware") ───────────────────────

/** Redirect the request to a new URL (defaults to 307 Temporary Redirect). */
export function redirect(url: string, status: 301 | 302 | 307 | 308 = 307): Response {
  return Response.redirect(url, status);
}

/**
 * Pass the request through to the next handler (no-op).
 * Return the result of `next()` from your middleware to signal "continue".
 */
export function next(): null {
  return null;
}

// ─── Internal types + runner ──────────────────────────────────────────────────

export interface MiddlewareModule {
  middleware: (req: Request) => Promise<Response | null | void> | Response | null | void;
  config?: { matcher?: string[] };
}

/**
 * Convert a matcher pattern like `/dashboard/:path*` or `/api/*` to a RegExp.
 *
 * Supported syntax:
 * - `:param`   — one path segment (any chars except `/`)
 * - `*`        — one path segment wildcard
 * - `**`       — zero or more segments (greedy)
 * - `:param*`  — zero or more remaining segments (Next.js `:path*` style)
 */
export function matcherToRegex(pattern: string): RegExp {
  // Escape regex special chars except the ones we handle manually
  const escaped = pattern
    .replace(/[.+*^${}()|[\]\\]/g, "\\$&")
    // :param* → zero-or-more segments (greedy, optional slash)
    .replace(/\/:[a-zA-Z_][a-zA-Z0-9_]*\\\*/g, "(?:/.*)?")
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*\\\*/g, "(?:/.*)?")
    // :param  → single segment
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, "[^/]+")
    // ** → zero-or-more segments (greedy, optional slash)
    .replace(/\/\*\*\\\*/g, "(?:/.*)?")
    .replace(/\\\*\\\*/g, ".*")
    // * → single segment
    .replace(/\\\*/g, "[^/]+");

  return new RegExp(`^${escaped}\\/?$`);
}

/**
 * Test whether a pathname matches any of the given matcher patterns.
 * If no patterns are provided, the middleware runs on every request.
 */
export function matchesMiddleware(pathname: string, matchers?: string[]): boolean {
  if (!matchers || matchers.length === 0) return true;
  return matchers.some((pattern) => matcherToRegex(pattern).test(pathname));
}

/**
 * Run the user middleware against the current request.
 * Returns a `Response` if the middleware handled the request (redirect, early
 * return, etc.) or `null` if it passed through (return nothing / undefined).
 */
export async function runMiddleware(
  mod: MiddlewareModule,
  req: Request,
): Promise<Response | null> {
  const { middleware, config } = mod;
  const pathname = new URL(req.url).pathname;

  if (!matchesMiddleware(pathname, config?.matcher)) return null;

  const result = await middleware(req);
  if (result instanceof Response) return result;
  return null;
}
