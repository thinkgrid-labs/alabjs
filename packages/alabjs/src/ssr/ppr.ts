/**
 * Alab PPR — build-time static shell pre-renderer and runtime shell reader.
 *
 * ## Build-time
 * `preRenderPPRShell()` renders a page with `PPRShellProvider` so that every
 * `<Dynamic>` emits a `data-ppr-hole` placeholder instead of its children.
 * The resulting HTML is saved to `.alabjs/ppr-cache/<slug>.html`.
 *
 * ## Runtime
 * `getPPRShell()` reads the pre-rendered HTML for a given route path, or
 * returns `null` if the file doesn't exist (triggers SSR fallback).
 */

import { createElement, Suspense, type ComponentType } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { PPRShellProvider } from "../components/Dynamic.js";
import { htmlShellBefore, htmlShellAfter } from "./html.js";
import type { HtmlShellOptions } from "./html.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Relative path (from cwd) where pre-rendered shells are written. */
export const PPR_CACHE_SUBDIR = ".alabjs/ppr-cache";

// ─── Filename helpers ─────────────────────────────────────────────────────────

/**
 * Convert a route path to a safe filesystem filename (no leading slash, no
 * dynamic segment brackets, slashes replaced with `__`).
 *
 * @example
 * routeToFilename("/")                  → "index"
 * routeToFilename("/posts")             → "posts"
 * routeToFilename("/posts/[id]")        → "posts___id_"
 * routeToFilename("/a/[b]/c/[d]")       → "a___b___c___d_"
 */
export function routeToFilename(routePath: string): string {
  const slug = routePath
    .replace(/^\//, "")                   // strip leading /
    .replace(/\[([^\]]+)\]/g, "__$1_")    // [param] → __param_
    .replace(/\//g, "__");                // / → __
  return (slug || "index") + ".html";
}

// ─── Build-time ───────────────────────────────────────────────────────────────

export interface PPRPreRenderOptions {
  /** Default component to render (page default export). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Page: ComponentType<any>;
  /** Layout components, outermost → innermost. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layouts: ComponentType<any>[];
  /** Options forwarded to `htmlShellBefore` (minus `headExtra`). */
  shellOpts: Omit<HtmlShellOptions, "headExtra">;
  /** Absolute path to the PPR cache directory. */
  pprCacheDir: string;
  /** Alab route path, e.g. `"/posts/[id]"`. */
  routePath: string;
}

/**
 * Pre-render the static HTML shell for a PPR page and persist it to disk.
 *
 * The render uses `PPRShellProvider` so every `<Dynamic>` in the tree emits
 * a `data-ppr-hole` placeholder — children (per-request logic) are omitted.
 *
 * Called from `alab build` after the Vite bundle step completes.
 */
export async function preRenderPPRShell({
  Page,
  layouts,
  shellOpts,
  pprCacheDir,
  routePath,
}: PPRPreRenderOptions): Promise<void> {
  // Build the element tree: layouts wrapping Page, all inside PPRShellProvider.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pageEl: any = createElement(Page, { params: {}, searchParams: {} });
  // Suspense wrapper guards against any accidental top-level suspension.
  pageEl = createElement(Suspense, { fallback: null }, pageEl);
  for (let i = layouts.length - 1; i >= 0; i--) {
    const Layout = layouts[i];
    if (Layout) pageEl = createElement(Layout, {}, pageEl);
  }
  // PPRShellProvider switches Dynamic into placeholder mode.
  // Pass children via props to satisfy strict TS prop checking.
  const tree = createElement(PPRShellProvider, { children: pageEl });

  // Wait for the full render (allReady) — we need a complete snapshot, not a
  // partially streamed response, because the file is served as-is from disk.
  const reactHtml = await new Promise<string>((resolve, reject) => {
    let result = "";
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) { result += chunk.toString(); cb(); },
      final(cb) { resolve(result); cb(); },
    });
    const { pipe } = renderToPipeableStream(tree, {
      onAllReady() { pipe(sink); },
      onError(err)  { reject(err instanceof Error ? err : new Error(String(err))); },
    });
  });

  const before = htmlShellBefore({ ...shellOpts, headExtra: "" });
  const after  = htmlShellAfter({});
  const fullHtml = `${before}${reactHtml}${after}`;

  mkdirSync(pprCacheDir, { recursive: true });
  writeFileSync(join(pprCacheDir, routeToFilename(routePath)), fullHtml, "utf8");
}

// ─── Runtime ──────────────────────────────────────────────────────────────────

/**
 * Return the pre-rendered static HTML shell for `routePath`, or `null` if the
 * cache file doesn't exist.
 *
 * Callers should fall back to normal SSR when `null` is returned.
 */
export function getPPRShell(routePath: string, pprCacheDir: string): string | null {
  const filePath = join(pprCacheDir, routeToFilename(routePath));
  try {
    return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  } catch {
    return null;
  }
}

/**
 * Inject a `<meta name="alabjs-build-id">` tag into a pre-rendered PPR shell.
 *
 * The shell is pre-built and therefore doesn't include the per-build ID. We
 * splice it in at serve time so skew protection still works for PPR pages.
 */
export function injectBuildIdIntoPPRShell(html: string, buildId: string): string {
  const tag = `<meta name="alabjs-build-id" content="${buildId.replace(/"/g, "&quot;")}" />`;
  // Insert after <head> if present; otherwise prepend to <html>.
  const headClose = html.indexOf("</head>");
  if (headClose !== -1) {
    return html.slice(0, headClose) + `  ${tag}\n` + html.slice(headClose);
  }
  return tag + html;
}

// ─── Layout discovery (prod) ──────────────────────────────────────────────────

/**
 * Find layout file paths for a given page route file, ordered
 * outermost → innermost. Mirrors the logic in `app.ts` but scoped to the
 * build-time dist directory.
 */
export function findBuildLayoutFiles(routeFile: string, distDir: string): string[] {
  const pageDir = dirname(routeFile);
  const parts = pageDir.split("/");
  const layouts: string[] = [];
  for (let i = 1; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    // esbuild compiles layout.tsx → layout.js in the dist/server tree.
    const candidate = `${dir}/layout.js`;
    if (existsSync(join(distDir, "server", candidate))) {
      layouts.push(candidate);
    }
  }
  return layouts;
}
