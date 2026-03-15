import { createApp as createH3App, createRouter, defineEventHandler, getQuery } from "h3";
import { createServer } from "node:http";
import { resolve, dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { toNodeListener } from "h3";
import type { RouteManifest } from "../router/manifest.js";
import { renderToResponse } from "../ssr/render.js";
import { generateSitemap } from "./sitemap.js";
import { csrfMiddleware, setCsrfCookie } from "./csrf.js";
import { handleImageRequest } from "./image.js";
import type { MiddlewareModule } from "./middleware.js";
import { runMiddleware } from "./middleware.js";
import type { PageMetadata } from "../types/index.js";

/**
 * Find layout file paths (relative to cwd root) for a given route.file, ordered outermost→innermost.
 * Checks the compiled dist directory for the existence of each layout.
 */
function findProdLayoutFiles(routeFile: string, distDir: string): string[] {
  // routeFile is like "app/users/[id]/page.tsx"
  const pageDir = dirname(routeFile);
  const parts = pageDir.split("/");
  const layouts: string[] = [];
  for (let i = 1; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    const layoutRelPath = `${dir}/layout.tsx`;
    if (existsSync(join(distDir, "server", layoutRelPath))) {
      layouts.push(layoutRelPath);
    }
  }
  return layouts;
}

/**
 * Find nearest error.tsx for a given route.file, searching innermost→outermost.
 */
function findProdErrorFile(routeFile: string, distDir: string): string | null {
  let dir = dirname(routeFile);
  while (dir.length > 0 && dir !== ".") {
    const candidate = `${dir}/error.tsx`;
    if (existsSync(join(distDir, "server", candidate))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findProdLoadingFile(routeFile: string, distDir: string): string | null {
  let dir = dirname(routeFile);
  while (dir.length > 0 && dir !== ".") {
    const candidate = `${dir}/loading.tsx`;
    if (existsSync(join(distDir, "server", candidate))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

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

  // ─── User middleware (middleware.ts compiled to dist/server/middleware.ts) ───
  const middlewareModulePath = `${distDir}/server/middleware.ts`;
  if (existsSync(middlewareModulePath)) {
    app.use(
      defineEventHandler(async (event) => {
        const mod = await import(middlewareModulePath) as MiddlewareModule;
        if (typeof mod.middleware !== "function") return;
        const req = event.node.req;
        const res = event.node.res;
        const url = new URL(
          req.url ?? "/",
          `http://${req.headers.host ?? "localhost"}`,
        );
        const webReq = new Request(url.toString(), {
          method: req.method ?? "GET",
          headers: req.headers as HeadersInit,
        });
        const middlewareRes = await runMiddleware(mod, webReq);
        if (middlewareRes) {
          res.statusCode = middlewareRes.status;
          middlewareRes.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await middlewareRes.arrayBuffer()));
          return null;
        }
        return undefined;
      }),
    );
  }

  // CSRF protection (active in production, skipped in dev)
  app.use(csrfMiddleware());

  // ─── Built-in routes ────────────────────────────────────────────────────────

  // Rust-powered image optimisation — resize + JPEG encode via `alab-napi`
  router.get(
    "/_alabjs/image",
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

  // ─── API routes (route.ts) ──────────────────────────────────────────────────
  for (const route of manifest.routes) {
    if (route.kind !== "api") continue;

    const h3ApiPath = route.path.replace(/\[([^\]]+)\]/g, ":$1");
    const apiModulePath = `${distDir}/server/${route.file}`;

    for (const method of ["get", "post", "put", "patch", "delete", "head"] as const) {
      router[method](
        h3ApiPath,
        defineEventHandler(async (event) => {
          const apiMod = await import(apiModulePath) as Record<string, unknown>;
          const handler = apiMod[method.toUpperCase()];
          if (typeof handler !== "function") {
            event.node.res.statusCode = 405;
            const allowed = ["GET","POST","PUT","PATCH","DELETE","HEAD"].filter(m => typeof apiMod[m] === "function").join(", ");
            event.node.res.setHeader("allow", allowed);
            event.node.res.end("Method Not Allowed");
            return;
          }
          const req = event.node.req;
          const chunks: Buffer[] = [];
          await new Promise<void>((ok) => {
            req.on("data", (c: Buffer) => chunks.push(c));
            req.on("end", ok);
          });
          const body = chunks.length ? Buffer.concat(chunks) : null;
          const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
          const webReq = new Request(url.toString(), {
            method: method.toUpperCase(),
            headers: req.headers as HeadersInit,
            body: body?.length ? body : null,
          });
          const webRes = await (handler as (r: Request) => Promise<Response>)(webReq);
          event.node.res.statusCode = webRes.status;
          webRes.headers.forEach((v, k) => event.node.res.setHeader(k, v));
          event.node.res.end(Buffer.from(await webRes.arrayBuffer()));
        }),
      );
    }
  }

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

        const rawParams = (event.context.params ?? {}) as Record<string, string>;
        const params = rawParams;

        const rawQuery = getQuery(event) as Record<string, string | string[]>;
        const searchParams: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawQuery)) {
          searchParams[k] = Array.isArray(v) ? v[0] ?? "" : v;
        }

        // Dynamically import the compiled page module from the dist directory.
        const pageModulePath = `${distDir}/server/${route.file}`;
        const mod = await import(pageModulePath) as {
          default?: unknown;
          metadata?: PageMetadata;
          generateMetadata?: (params: Record<string, string>) => PageMetadata | Promise<PageMetadata>;
          ssr?: boolean;
        };

        const Page = mod.default;
        if (typeof Page !== "function") {
          res.statusCode = 500;
          res.end(`[alabjs] Page has no default export: ${route.file}`);
          return;
        }

        // Support both static metadata and dynamic generateMetadata (production fix)
        const metadata: PageMetadata =
          typeof mod.generateMetadata === "function"
            ? await mod.generateMetadata(params)
            : (mod.metadata ?? {});

        const ssrEnabled = mod.ssr === true;

        // ── Layouts ──────────────────────────────────────────────────────────
        const layoutRelPaths = findProdLayoutFiles(route.file, distDir);
        const layoutMods = await Promise.all(
          layoutRelPaths.map((p) => import(`${distDir}/server/${p}`)),
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layouts = layoutMods.map((m: any) => m.default).filter((c: unknown): c is any => typeof c === "function");
        const layoutsJson = JSON.stringify(layoutRelPaths);
        const loadingFile = findProdLoadingFile(route.file, distDir) ?? undefined;

        // Inject CSRF token into the HTML head so client JS can read it.
        const headExtra = `<meta name="csrf-token" content="${csrfToken.replace(/"/g, "&quot;")}" />`;

        try {
          renderToResponse(res, {
            Page: Page as Parameters<typeof renderToResponse>[1]["Page"],
            layouts,
            params,
            searchParams,
            metadata,
            routeFile: route.file,
            layoutsJson,
            loadingFile,
            ssr: ssrEnabled,
            headExtra,
          });
        } catch (err) {
          // ── error.tsx fallback ────────────────────────────────────────────
          const errorRelPath = findProdErrorFile(route.file, distDir);
          if (errorRelPath) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const errorMod = await import(`${distDir}/server/${errorRelPath}`) as any;
              const ErrorPage = errorMod.default;
              if (typeof ErrorPage === "function") {
                renderToResponse(res, {
                  Page: ErrorPage as Parameters<typeof renderToResponse>[1]["Page"],
                  params,
                  searchParams,
                  metadata: {},
                  routeFile: errorRelPath,
                  ssr: true,
                  headExtra,
                });
                return;
              }
            } catch { /* fall through to plain error */ }
          }
          console.error("[alabjs] render error:", err);
          res.statusCode = 500;
          res.end(`[alabjs] Render error: ${String(err)}`);
        }
      }),
    );
  }

  app.use(router);

  // ─── 404 / not-found fallback ────────────────────────────────────────────────
  const notFoundPath = `${distDir}/server/app/not-found.tsx`;
  app.use(
    defineEventHandler(async (event) => {
      const res = event.node.res;
      res.statusCode = 404;

      if (existsSync(notFoundPath)) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nfMod = await import(notFoundPath) as any;
          const NotFound = nfMod.default;
          if (typeof NotFound === "function") {
            renderToResponse(res, {
              Page: NotFound as Parameters<typeof renderToResponse>[1]["Page"],
              params: {},
              searchParams: {},
              metadata: { title: "404 — Not Found" },
              routeFile: "app/not-found.tsx",
              ssr: true,
            });
            return;
          }
        } catch { /* fall through */ }
      }

      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("404 Not Found");
    }),
  );

  return {
    listen(port = 3000) {
      const server = createServer(toNodeListener(app));
      server.listen(port, () => {
        console.log(`  alab  ready at http://localhost:${port}`);
      });
    },
  };
}
