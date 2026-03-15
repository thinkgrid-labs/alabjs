import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

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
      out.push({ pattern, paramNames, file: full, ssr: true });
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
