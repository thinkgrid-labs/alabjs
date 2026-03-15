import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";

export interface DevRoute {
  /** Regex that matches the URL pathname for this route. */
  pattern: RegExp;
  /** Ordered list of param names, matching regex capture groups. */
  paramNames: string[];
  /** Absolute path to the page module on disk. */
  file: string;
  /** Whether SSR is enabled (opt-out via `export const ssr = false`). */
  ssr: boolean;
}

/**
 * Scan `appDir` (the project's `app/` directory) for `page.tsx` / `page.ts`
 * files and build a list of matchable routes for the dev server middleware.
 *
 * Only TypeScript files are considered — Alab is TypeScript-only.
 */
export function scanDevRoutes(appDir: string): DevRoute[] {
  const routes: DevRoute[] = [];
  collectRoutes(appDir, appDir, routes);
  // Sort so that static segments beat dynamic ones (/users/new before /users/[id]).
  routes.sort((a, b) => {
    const aScore = paramScore(a.paramNames.length);
    const bScore = paramScore(b.paramNames.length);
    return aScore - bScore;
  });
  return routes;
}

function collectRoutes(appDir: string, dir: string, out: DevRoute[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      collectRoutes(appDir, full, out);
    } else if (entry === "page.tsx" || entry === "page.ts") {
      const rel = relative(appDir, full);
      const urlPath = relFileToUrlPath(rel);
      const { pattern, paramNames } = urlPathToRegex(urlPath);
      out.push({ pattern, paramNames, file: full, ssr: false });
    }
  }
}

/**
 * Convert a relative file path (from appDir) to a URL path pattern.
 *
 * Examples:
 *   page.tsx                  → /
 *   about/page.tsx            → /about
 *   users/[id]/page.tsx       → /users/[id]
 *   users/[id]/posts/page.tsx → /users/[id]/posts
 */
function relFileToUrlPath(rel: string): string {
  // Normalise Windows separators
  const parts = rel.split(sep).join("/").split("/");
  // Remove the trailing `page.tsx` / `page.ts`
  parts.pop();
  if (parts.length === 0) return "/";
  return "/" + parts.join("/");
}

/**
 * Convert an Alab URL path pattern to a regex and extract param names.
 *
 * `[id]` → capture group `([^/]+)`, param name `id`
 */
function urlPathToRegex(urlPath: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = urlPath
    .split("/")
    .map((segment) => {
      const match = /^\[(.+)\]$/.exec(segment);
      if (match) {
        paramNames.push(match[1]!);
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  // Match exact path (ignoring trailing slash for non-root paths)
  const pattern = urlPath === "/" ? /^\/$/ : new RegExp(`^${regexStr}\\/?$`);
  return { pattern, paramNames };
}

/** Lower score = higher priority (static routes beat dynamic ones). */
function paramScore(paramCount: number): number {
  return paramCount;
}

/**
 * Find all layout.tsx files that apply to a given page file, ordered outermost → innermost.
 *
 * Given `app/dashboard/users/page.tsx`, returns:
 *   [ "app/layout.tsx", "app/dashboard/layout.tsx" ]   (only those that exist)
 */
export function findLayoutFiles(pageFile: string, appDir: string): string[] {
  const layouts: string[] = [];
  let dir = dirname(pageFile);

  // Collect directories from page dir up to (and including) appDir
  const dirs: string[] = [];
  while (dir.length >= appDir.length) {
    dirs.unshift(dir); // prepend so we get outermost first
    if (dir === appDir) break;
    dir = dirname(dir);
  }

  for (const d of dirs) {
    const candidate = join(d, "layout.tsx");
    if (existsSync(candidate)) layouts.push(candidate);
  }
  return layouts;
}

/**
 * Find the nearest error.tsx file for a given page file, searching innermost → outermost.
 * Returns absolute path or null if none found.
 */
export function findErrorFile(pageFile: string, appDir: string): string | null {
  let dir = dirname(pageFile);
  while (dir.length >= appDir.length) {
    const candidate = join(dir, "error.tsx");
    if (existsSync(candidate)) return candidate;
    if (dir === appDir) break;
    dir = dirname(dir);
  }
  return null;
}

/**
 * Find the nearest loading.tsx file for a given page file, searching innermost → outermost.
 * Returns absolute path or null if none found.
 */
export function findLoadingFile(pageFile: string, appDir: string): string | null {
  let dir = dirname(pageFile);
  while (dir.length >= appDir.length) {
    const candidate = join(dir, "loading.tsx");
    if (existsSync(candidate)) return candidate;
    if (dir === appDir) break;
    dir = dirname(dir);
  }
  return null;
}

export interface DevApiRoute {
  pattern: RegExp;
  paramNames: string[];
  file: string;
}

/**
 * Scan `appDir` for `route.ts` / `route.tsx` files and build a list of API routes.
 * These handle HTTP method exports: GET, POST, PUT, PATCH, DELETE.
 */
export function scanDevApiRoutes(appDir: string): DevApiRoute[] {
  const routes: DevApiRoute[] = [];
  collectApiRoutes(appDir, appDir, routes);
  routes.sort((a, b) => a.paramNames.length - b.paramNames.length);
  return routes;
}

function collectApiRoutes(appDir: string, dir: string, out: DevApiRoute[]): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectApiRoutes(appDir, full, out);
    } else if (entry === "route.ts" || entry === "route.tsx") {
      const rel = relative(appDir, full);
      const urlPath = relFileToUrlPath(rel.replace(/route\.(tsx?)$/, "page.$1"));
      const { pattern, paramNames } = urlPathToRegex(urlPath);
      out.push({ pattern, paramNames, file: full });
    }
  }
}

/**
 * Match a pathname against the API route list.
 */
export function matchDevApiRoute(
  routes: DevApiRoute[],
  pathname: string,
): { route: DevApiRoute; params: Record<string, string> } | null {
  for (const route of routes) {
    const m = route.pattern.exec(pathname);
    if (m) {
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1] ?? ""); });
      return { route, params };
    }
  }
  return null;
}

/**
 * Match an incoming URL pathname against the dev route list.
 * Returns the matched route and extracted params, or `null` if no match.
 */
export function matchDevRoute(
  routes: DevRoute[],
  pathname: string,
): { route: DevRoute; params: Record<string, string> } | null {
  for (const route of routes) {
    const m = route.pattern.exec(pathname);
    if (m) {
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(m[i + 1] ?? "");
      });
      return { route, params };
    }
  }
  return null;
}
