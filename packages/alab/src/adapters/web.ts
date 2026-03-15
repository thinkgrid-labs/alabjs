/**
 * Alab Web Fetch adapter — shared by Cloudflare Workers and Deno Deploy.
 *
 * Both runtimes expose the standard Web Fetch API (`Request` / `Response`).
 * The adapter accepts a pre-built route manifest and a map of pre-bundled
 * page modules, then returns a `(request: Request) => Promise<Response>`
 * handler that the platform wires up itself.
 *
 * Image optimization (`/_alab/image`) is not available on these runtimes
 * because the Rust napi binary cannot run there.  The handler redirects
 * image requests to the original source URL so images still load correctly
 * in production — you can also point these to Cloudflare Images or a CDN.
 */

import { createElement } from "react";
import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { htmlShellBefore, htmlShellAfter } from "../ssr/html.js";
import { generateSitemap } from "../server/sitemap.js";
import type { RouteManifest, Route } from "../router/manifest.js";
import type { PageMetadata } from "../types/index.js";

export type PageModule = {
  default: (props: {
    params: Record<string, string>;
    searchParams: Record<string, string>;
  }) => unknown;
  metadata?: PageMetadata | undefined;
  generateMetadata?: (params: Record<string, string>) => PageMetadata | Promise<PageMetadata>;
  ssr?: boolean | undefined;
};

/** API route module — exports HTTP method handlers. */
export type ApiModule = Record<string, (req: Request) => Promise<Response> | Response>;

/**
 * Create a Web Fetch API handler from the Alab route manifest and a map of
 * pre-bundled page modules.
 *
 * @param manifest    - Route manifest (from `alab build` or `.alab/manifest.json`)
 * @param pageModules - Map of route file path → imported page module
 *
 * @example
 * ```ts
 * // cloudflare worker entry (src/worker.ts):
 * import { createFetchHandler } from "alab/adapters/web";
 * import manifest from "../.alab/manifest.json";
 * import * as pages from "../.alab/pages";   // bundled by wrangler
 *
 * export default createFetchHandler(manifest, pages);
 * ```
 */
export function createFetchHandler(
  manifest: RouteManifest,
  pageModules: Record<string, PageModule>,
  apiModules: Record<string, ApiModule> = {},
): { fetch(request: Request): Promise<Response> } {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Security headers applied to every response.
      const secHeaders: Record<string, string> = {
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
        "referrer-policy": "strict-origin-when-cross-origin",
      };

      // ── Auto sitemap ──────────────────────────────────────────────────────
      if (pathname === "/sitemap.xml") {
        const xml = generateSitemap(manifest.routes, url.origin);
        return new Response(xml, {
          headers: {
            ...secHeaders,
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      }

      // ── Image optimisation — redirect to raw src ──────────────────────────
      // The Rust napi binary cannot run on Cloudflare Workers or Deno Deploy.
      // Redirect to the original source URL so images still load.  Replace
      // this with Cloudflare Images / a CDN transform URL in production.
      if (pathname.startsWith("/_alab/image")) {
        const src = url.searchParams.get("src") ?? "";
        if (src) return Response.redirect(new URL(src, url.origin).href, 302);
        return new Response("[alab] Image src missing", { status: 400, headers: secHeaders });
      }

      // ── API routes ────────────────────────────────────────────────────────
      const matchedApi = matchRoute(manifest.routes.filter(r => r.kind === "api"), pathname);
      if (matchedApi) {
        const apiMod = apiModules[matchedApi.route.file];
        if (!apiMod) {
          return new Response(`[alab] API module not found: ${matchedApi.route.file}`, {
            status: 500, headers: secHeaders,
          });
        }
        const method = request.method.toUpperCase();
        const handler = apiMod[method];
        if (typeof handler !== "function") {
          const allowed = Object.keys(apiMod).filter(k => /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(k)).join(", ");
          return new Response("Method Not Allowed", { status: 405, headers: { ...secHeaders, allow: allowed } });
        }
        return handler(request);
      }

      // ── Page routing ──────────────────────────────────────────────────────
      const matched = matchRoute(manifest.routes, pathname);
      if (!matched) {
        // Check for not-found page module
        const nfMod = pageModules["app/not-found.tsx"];
        if (nfMod?.default) {
          const shellBefore = htmlShellBefore({
            metadata: { title: "404 — Not Found" },
            paramsJson: "{}",
            searchParamsJson: "{}",
            routeFile: "app/not-found.tsx",
            ssr: true,
          });
          const shellAfter = htmlShellAfter({});
          const enc = new TextEncoder();
          type NfProps = { params: Record<string, string>; searchParams: Record<string, string> };
          const nfStream = await renderToReadableStream(
            createElement(nfMod.default as React.ComponentType<NfProps>, { params: {}, searchParams: {} }),
            { onError(err) { console.error("[alab] not-found SSR error:", err); } },
          );
          await nfStream.allReady;
          const readable = new ReadableStream({
            async start(ctrl) {
              ctrl.enqueue(enc.encode(shellBefore));
              const reader = nfStream.getReader();
              for (;;) { const { done, value } = await reader.read(); if (done) break; ctrl.enqueue(value); }
              ctrl.enqueue(enc.encode(shellAfter));
              ctrl.close();
            },
          });
          return new Response(readable, { status: 404, headers: { ...secHeaders, "content-type": "text/html; charset=utf-8" } });
        }
        return new Response("Not Found", { status: 404, headers: secHeaders });
      }

      const { route, params } = matched;
      const mod = pageModules[route.file];
      if (!mod?.default) {
        return new Response(`[alab] Page module not found: ${route.file}`, {
          status: 500,
          headers: secHeaders,
        });
      }

      const Page = mod.default;
      const metadata: PageMetadata =
        typeof mod.generateMetadata === "function"
          ? await mod.generateMetadata(params)
          : (mod.metadata ?? {});
      const ssrEnabled = mod.ssr === true;

      const searchParams: Record<string, string> = {};
      for (const [k, v] of url.searchParams.entries()) {
        searchParams[k] = v;
      }

      const shellBefore = htmlShellBefore({
        metadata,
        paramsJson: JSON.stringify(params),
        searchParamsJson: JSON.stringify(searchParams),
        routeFile: route.file,
        ssr: ssrEnabled,
      });
      const shellAfter = htmlShellAfter({});

      if (ssrEnabled) {
        const enc = new TextEncoder();

        let didError = false;
        type PageProps = { params: Record<string, string>; searchParams: Record<string, string> };
        const reactStream = await renderToReadableStream(
          createElement(Page as React.ComponentType<PageProps>, { params, searchParams }),
          {
            onError(err) {
              didError = true;
              console.error("[alab] SSR error:", err);
            },
          },
        );

        // Wait for all Suspense boundaries to resolve (no streaming on Workers).
        await reactStream.allReady;

        const readable = new ReadableStream({
          async start(ctrl) {
            ctrl.enqueue(enc.encode(shellBefore));
            const reader = reactStream.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              ctrl.enqueue(value);
            }
            ctrl.enqueue(enc.encode(shellAfter));
            ctrl.close();
          },
        });

        return new Response(readable, {
          status: didError ? 500 : 200,
          headers: { ...secHeaders, "content-type": "text/html; charset=utf-8" },
        });
      }

      // CSR — return the HTML shell only; React hydrates on the client.
      return new Response(`${shellBefore}${shellAfter}`, {
        headers: { ...secHeaders, "content-type": "text/html; charset=utf-8" },
      });
    },
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function matchRoute(
  routes: Route[],
  pathname: string,
): { route: Route; params: Record<string, string> } | null {
  // Sort: fewer params = higher priority (static routes beat dynamic ones).
  const sorted = [...routes].sort((a, b) => a.params.length - b.params.length);

  for (const route of sorted) {
    if (route.kind !== "page" && route.kind !== "api") continue;

    const paramNames: string[] = [];
    const regexStr = route.path
      .split("/")
      .map((seg) => {
        const m = /^\[(.+)\]$/.exec(seg);
        if (m) {
          paramNames.push(m[1]!);
          return "([^/]+)";
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");

    const regex =
      route.path === "/" ? /^\/$/ : new RegExp(`^${regexStr}\\/?$`);
    const match = regex.exec(pathname);

    if (match) {
      const params: Record<string, string> = {};
      paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1] ?? "");
      });
      return { route, params };
    }
  }
  return null;
}
