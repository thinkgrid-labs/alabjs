import { createApp as createH3App, createRouter, defineEventHandler, getQuery, readBody } from "h3";
import { createServer } from "node:http";
import { resolve, dirname, join, extname } from "node:path";
import { existsSync, createReadStream, statSync, readFileSync } from "node:fs";
import { toNodeListener } from "h3";
import type { RouteManifest } from "../router/manifest.js";
import { renderToResponse } from "../ssr/render.js";
import { generateSitemap } from "./sitemap.js";
import { csrfMiddleware, setCsrfCookie } from "./csrf.js";
import { handleImageRequest } from "./image.js";
import type { MiddlewareModule } from "./middleware.js";
import { runMiddleware } from "./middleware.js";
import type { PageMetadata } from "../types/index.js";
import { checkRevalidateAuth, applyRevalidate } from "./revalidate.js";
import { applyCdnHeaders, type CdnCache } from "./cdn.js";
import { getPPRShell, injectBuildIdIntoPPRShell, PPR_CACHE_SUBDIR } from "../ssr/ppr.js";
import { handleVitalsBeacon, handleAnalyticsDashboard } from "../analytics/handler.js";

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

  // Load the build ID written by `alab build` for skew protection.
  // If the file is absent (first-run / non-standard setup) skew detection
  // is silently disabled — existing behaviour is unchanged.
  let buildId: string | undefined;
  try {
    buildId = readFileSync(resolve(distDir, "BUILD_ID"), "utf8").trim() || undefined;
  } catch { /* no BUILD_ID file — skew protection disabled */ }

  // Absolute path to the PPR shell cache directory.
  const pprCacheDir = resolve(distDir, "../../", PPR_CACHE_SUBDIR);

  // ─── Global middleware ───────────────────────────────────────────────────────
  app.use(
    defineEventHandler((event) => {
      const res = event.node.res;
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("x-frame-options", "SAMEORIGIN");
      res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
      res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
      res.setHeader("x-permitted-cross-domain-policies", "none");
      res.setHeader(
        "content-security-policy",
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data: https:",
          "connect-src 'self'",
          "media-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'self'",
          "upgrade-insecure-requests",
        ].join("; "),
      );
      // HSTS — only meaningful over HTTPS; set in production only.
      res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
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

  // ─── Static file serving ────────────────────────────────────────────────────
  // Serves built client assets (JS/CSS from `.alabjs/dist/client/`) and files
  // from the project's `public/` directory. Dynamic alab routes take priority
  // via the router registered below; this handler only fires for real files.
  const clientDir = resolve(distDir, "client");
  const MIME_TYPES: Record<string, string> = {
    ".js":    "application/javascript; charset=utf-8",
    ".mjs":   "application/javascript; charset=utf-8",
    ".css":   "text/css; charset=utf-8",
    ".html":  "text/html; charset=utf-8",
    ".json":  "application/json; charset=utf-8",
    ".svg":   "image/svg+xml",
    ".png":   "image/png",
    ".jpg":   "image/jpeg",
    ".jpeg":  "image/jpeg",
    ".gif":   "image/gif",
    ".webp":  "image/webp",
    ".ico":   "image/x-icon",
    ".woff":  "font/woff",
    ".woff2": "font/woff2",
    ".ttf":   "font/ttf",
    ".txt":   "text/plain; charset=utf-8",
    ".xml":   "application/xml; charset=utf-8",
    ".map":   "application/json; charset=utf-8",
  };

  app.use(
    defineEventHandler((event) => {
      const req = event.node.req;
      const res = event.node.res;
      if (req.method !== "GET" && req.method !== "HEAD") return;

      const rawPath = (req.url ?? "/").split("?")[0] ?? "/";
      // Decode and strip traversal attempts
      let relPath: string;
      try { relPath = decodeURIComponent(rawPath); } catch { return; }
      if (relPath.includes("..")) return;

      const ext = extname(relPath).toLowerCase();
      const contentType = MIME_TYPES[ext];
      if (!contentType) return; // skip extensionless paths (page routes)

      // 1. Built client assets (JS chunks, CSS, source maps)
      const clientCandidate = join(clientDir, relPath);
      if (existsSync(clientCandidate)) {
        const stat = statSync(clientCandidate);
        if (stat.isFile()) {
          res.setHeader("content-type", contentType);
          res.setHeader("content-length", stat.size);
          // Immutable cache for hashed assets; short TTL for others
          const isHashed = /\.[a-f0-9]{8,}\.[a-z]+$/.test(relPath);
          res.setHeader("cache-control", isHashed
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600");
          if (req.method === "HEAD") { res.end(); return null; }
          createReadStream(clientCandidate).pipe(res);
          return null;
        }
      }

      // 2. Public directory (favicons, fonts, open-graph images, etc.)
      const publicCandidate = join(publicDir, relPath);
      if (existsSync(publicCandidate)) {
        const stat = statSync(publicCandidate);
        if (stat.isFile()) {
          res.setHeader("content-type", contentType);
          res.setHeader("content-length", stat.size);
          res.setHeader("cache-control", "public, max-age=3600");
          if (req.method === "HEAD") { res.end(); return null; }
          createReadStream(publicCandidate).pipe(res);
          return null;
        }
      }
      return undefined;
    }),
  );

  // ─── Built-in routes ────────────────────────────────────────────────────────

  // Rust-powered image optimisation — resize + JPEG encode via `alab-napi`
  router.get(
    "/_alabjs/image",
    defineEventHandler((event) => {
      return handleImageRequest(event.node.req, event.node.res, publicDir);
    }),
  );

  // On-demand ISR revalidation
  router.post(
    "/_alabjs/revalidate",
    defineEventHandler(async (event) => {
      const res = event.node.res;
      res.setHeader("content-type", "application/json");

      if (!checkRevalidateAuth(event.node.req.headers["authorization"])) {
        res.statusCode = 401;
        return JSON.stringify({ error: "Unauthorized. Set Authorization: Bearer <ALAB_REVALIDATE_SECRET>." });
      }

      const body = await readBody(event);
      const result = applyRevalidate(body);
      if ("error" in result) {
        res.statusCode = result.status;
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify(result);
    }),
  );

  // Core Web Vitals beacon — receives POST from <Analytics> component
  router.post(
    "/_alabjs/vitals",
    defineEventHandler((event) => {
      return handleVitalsBeacon(event.node.req, event.node.res);
    }),
  );

  // Analytics dashboard — GET aggregated per-route stats
  router.get(
    "/_alabjs/analytics",
    defineEventHandler((event) => {
      handleAnalyticsDashboard(event.node.req, event.node.res);
      return null;
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
          const nodeRes = event.node.res;
          nodeRes.statusCode = webRes.status;
          webRes.headers.forEach((v, k) => nodeRes.setHeader(k, v));

          // SSE: pipe the ReadableStream body without buffering.
          if (
            (webRes.headers.get("content-type") ?? "").startsWith("text/event-stream") &&
            webRes.body
          ) {
            const reader = webRes.body.getReader();
            nodeRes.on("close", () => { void reader.cancel(); });
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done || nodeRes.destroyed) break;
                nodeRes.write(value);
              }
            } catch { /* client disconnected */ } finally {
              nodeRes.end();
            }
            return;
          }

          nodeRes.end(Buffer.from(await webRes.arrayBuffer()));
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

        // Skew protection: tell the client which build this server is running.
        if (buildId) {
          res.setHeader("x-alab-build-id", buildId);
          const clientBuildId = event.node.req.headers["x-alab-build-id"];
          if (clientBuildId && clientBuildId !== buildId) {
            res.setHeader("x-alab-revalidate", "1");
          }
        }

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
          cdnCache?: CdnCache;
          ppr?: boolean;
        };

        const Page = mod.default;
        if (typeof Page !== "function") {
          res.statusCode = 500;
          res.end(`[alabjs] Page has no default export: ${route.file}`);
          return;
        }

        // ── PPR: serve pre-rendered static shell ──────────────────────────────
        // Pages with `export const ppr = true` get a static HTML shell built
        // at `alab build` time. Serve it instantly with a long CDN TTL so the
        // static portion is edge-cached. Dynamic sections (`<Dynamic>`) render
        // their fallback in the shell and are filled in client-side via React
        // hydration, or server-side via Suspense streaming on direct hits.
        if (mod.ppr === true) {
          let shell = getPPRShell(route.path, pprCacheDir);
          if (shell !== null) {
            // Inject the per-build skew-protection tag into the pre-rendered HTML.
            if (buildId) shell = injectBuildIdIntoPPRShell(shell, buildId);

            res.statusCode = 200;
            res.setHeader("content-type", "text/html; charset=utf-8");
            // Long CDN TTL: static shell doesn't change until the next build.
            res.setHeader("cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");
            res.setHeader("x-alab-ppr", "shell");
            if (buildId) res.setHeader("x-alab-build-id", buildId);
            res.end(shell);
            return;
          }
          // Shell not found — fall through to normal SSR and warn once.
          console.warn(`[alabjs] ppr: no pre-rendered shell for ${route.path} — run \`alab build\` to generate it. Falling back to SSR.`);
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

        // ── Cache-control + CSRF ──────────────────────────────────────────────
        // Pages that export `cdnCache` are public, edge-cacheable pages.
        // They get CDN headers instead of `no-store`, and CSRF tokens are
        // omitted — a shared cache would deliver the same token to every
        // visitor, defeating CSRF protection.
        let headExtra = "";
        if (mod.cdnCache) {
          applyCdnHeaders(res, mod.cdnCache);
        } else {
          // Private page: must not be cached by intermediaries.
          res.setHeader("cache-control", "no-store");
          const csrfToken = setCsrfCookie(event);
          headExtra = `<meta name="csrf-token" content="${csrfToken.replace(/"/g, "&quot;")}" />`;
        }

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
            ...(buildId ? { buildId } : {}),
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
            } catch (fallbackErr) {
              console.warn(`[alabjs] error.tsx fallback also failed for ${route.file}:`, fallbackErr);
              // fall through to plain error
            }
          }
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[alabjs] render error in ${route.file}:`, err);
          res.statusCode = 500;
          res.end(`[alabjs] Render error in ${route.file}: ${msg}`);
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
        } catch (notFoundErr) {
          console.warn("[alabjs] not-found.tsx render failed:", notFoundErr);
          // fall through to plain text 404
        }
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
