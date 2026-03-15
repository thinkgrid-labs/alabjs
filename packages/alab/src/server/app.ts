import { createApp as createH3App, createRouter, defineEventHandler, getQuery } from "h3";
import { createServer } from "node:http";
import { toNodeListener } from "h3";
import type { RouteManifest } from "../router/manifest.js";
import { renderToResponse } from "../ssr/render.js";
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

  // ─── Security headers ───────────────────────────────────────────────────────
  app.use(
    defineEventHandler((event) => {
      event.node.res.setHeader("x-content-type-options", "nosniff");
      event.node.res.setHeader("x-frame-options", "SAMEORIGIN");
      event.node.res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
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

        // Dynamically import the compiled page module from the dist directory.
        // Vite's production build emits all page modules into distDir.
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

        // Extract params from H3's matched route
        const rawParams = (event.context.params ?? {}) as Record<string, string>;
        // Re-map H3 `:id` keys back to Alab `[id]` param names (already decoded by H3)
        const params = rawParams;

        const rawQuery = getQuery(event) as Record<string, string | string[]>;
        const searchParams: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawQuery)) {
          searchParams[k] = Array.isArray(v) ? v[0] ?? "" : v;
        }

        renderToResponse(res, {
          Page: Page as Parameters<typeof renderToResponse>[1]["Page"],
          params,
          searchParams,
          metadata,
          routeFile: route.file,
          ssr: ssrEnabled,
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
