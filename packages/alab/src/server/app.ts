import { createApp as createH3App, createRouter, defineEventHandler, getQuery } from "h3";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { toNodeListener } from "h3";
import type { RouteManifest } from "../router/manifest.js";
import { renderToResponse } from "../ssr/render.js";
import { generateSitemap } from "./sitemap.js";
import { csrfMiddleware, setCsrfCookie } from "./csrf.js";
import { handleImageRequest } from "./image.js";
import type { PageMetadata } from "../types/index.js";

export interface AlabApp {
  listen(port?: number): void;
}

/**
 * Create and return an Alab HTTP application backed by H3.
 *
 * In production (`alab start`), this is the entry point.
 * In development, Vite's dev server wraps the SSR logic directly via the
 * dev command middleware — this function is not used in dev.
 */
export function createApp(manifest: RouteManifest, distDir: string): AlabApp {
  const app = createH3App();
  const router = createRouter();
  const publicDir = resolve(distDir, "../../public");

  // ─── Global middleware ───────────────────────────────────────────────────────
  app.use(
    defineEventHandler((event) => {
      event.node.res.setHeader("x-content-type-options", "nosniff");
      event.node.res.setHeader("x-frame-options", "SAMEORIGIN");
      event.node.res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    }),
  );

  // CSRF protection (active in production, skipped in dev)
  app.use(csrfMiddleware());

  // ─── Built-in routes ────────────────────────────────────────────────────────

  // Rust-powered image optimisation — resize + JPEG encode via `alab-napi`
  router.get(
    "/_alab/image",
    defineEventHandler((event) => {
      return handleImageRequest(event.node.req, event.node.res, publicDir);
    }),
  );

  // Auto sitemap.xml from route manifest
  router.get(
    "/sitemap.xml",
    defineEventHandler((event) => {
      const baseUrl =
        process.env["PUBLIC_URL"] ??
        `http://localhost:${process.env["PORT"] ?? "3000"}`;
      const xml = generateSitemap(manifest.routes, baseUrl);
      event.node.res.setHeader("content-type", "application/xml; charset=utf-8");
      event.node.res.setHeader("cache-control", "public, max-age=3600");
      return xml;
    }),
  );

  // ─── Page routes ────────────────────────────────────────────────────────────
  for (const route of manifest.routes) {
    if (route.kind !== "page") continue;

    // Convert Alab path pattern `/users/[id]` → H3 pattern `/users/:id`
    const h3Path = route.path.replace(/\[([^\]]+)\]/g, ":$1");

    router.get(
      h3Path,
      defineEventHandler(async (event) => {
        const res = event.node.res;

        // Set CSRF cookie so the client can send it on mutations.
        const csrfToken = setCsrfCookie(event);

        // Dynamically import the compiled page module from the dist directory.
        const pageModulePath = `${distDir}/server/${route.file}`;
        const mod = await import(pageModulePath) as {
          default?: unknown;
          metadata?: PageMetadata;
          ssr?: boolean;
        };

        const Page = mod.default;
        if (typeof Page !== "function") {
          res.statusCode = 500;
          res.end(`[alab] Page has no default export: ${route.file}`);
          return;
        }

        const metadata: PageMetadata = mod.metadata ?? {};
        const ssrEnabled = mod.ssr !== false;

        const rawParams = (event.context.params ?? {}) as Record<string, string>;
        const params = rawParams;

        const rawQuery = getQuery(event) as Record<string, string | string[]>;
        const searchParams: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawQuery)) {
          searchParams[k] = Array.isArray(v) ? v[0] ?? "" : v;
        }

        // Inject CSRF token into the HTML head so client JS can read it.
        const headExtra = `<meta name="csrf-token" content="${csrfToken.replace(/"/g, "&quot;")}" />`;

        renderToResponse(res, {
          Page: Page as Parameters<typeof renderToResponse>[1]["Page"],
          params,
          searchParams,
          metadata,
          routeFile: route.file,
          ssr: ssrEnabled,
          headExtra,
        });
      }),
    );
  }

  app.use(router);

  return {
    listen(port = 3000) {
      const server = createServer(toNodeListener(app));
      server.listen(port, () => {
        console.log(`  alab  ready at http://localhost:${port}`);
      });
    },
  };
}
