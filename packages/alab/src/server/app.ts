import { createApp as createH3App, createRouter, defineEventHandler, toNodeListener } from "h3";
import { createServer } from "node:http";
import type { RouteManifest } from "../router/manifest.js";

export interface AlabApp {
  listen(port?: number): void;
}

/**
 * Create and return an Alab HTTP application backed by H3.
 *
 * In production (`alab start`), this is the entry point.
 * In development, Vite's dev server wraps this via `alab-vite-plugin`.
 */
export function createApp(manifest: RouteManifest): AlabApp {
  const app = createH3App();
  const router = createRouter();

  // Register each page route
  for (const route of manifest.routes) {
    if (route.kind === "page") {
      router.get(
        route.path,
        defineEventHandler(async (event) => {
          // SSR handler: dynamic import the page module and render it.
          // The full render pipeline is set up by the build step.
          return `<!doctype html><html><body><!-- alab:ssr:${route.file} --></body></html>`;
        }),
      );
    }
  }

  app.use(router);

  return {
    listen(port = 3000) {
      const server = createServer(toNodeListener(app));
      server.listen(port, () => {
        console.log(`  alab ready at http://localhost:${port}`);
      });
    },
  };
}
