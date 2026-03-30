import { createApp as createH3App, createRouter, defineEventHandler, getQuery, readBody } from "h3";
import { createServer } from "node:http";
import { resolve, dirname, join, extname } from "node:path";
import { existsSync, createReadStream, statSync, readFileSync, readdirSync } from "node:fs";
import { createGzip, createBrotliCompress } from "node:zlib";
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
import { buildImportMap } from "../config.js";
import type { FederationConfig } from "../config.js";
import { registerLiveComponent } from "../live/registry.js";
import { renderLiveFragment, hashFragment } from "../live/renderer.js";
import { subscribeToTag } from "../live/broadcaster.js";

/** Walk dist/server recursively and collect all *.server.js paths (compiled server functions). */
function findDistServerFiles(distDir: string): string[] {
  const serverDir = join(distDir, "server");
  const results: string[] = [];
  function walk(dir: string) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".server.js")) {
          results.push(fullPath);
        }
      }
    } catch { /* not readable */ }
  }
  walk(serverDir);
  return results;
}

/** Walk dist/server recursively and register all *.live.js modules. */
async function registerAllLiveComponents(distDir: string): Promise<void> {
  const serverDir = join(distDir, "server");
  const files: string[] = [];

  function walk(dir: string) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".live.js")) {
          files.push(fullPath);
        }
      }
    } catch { /* not readable */ }
  }
  walk(serverDir);

  for (const filePath of files) {
    try {
      const mod = await import(filePath) as {
        liveId?: string;
        liveInterval?: number;
        liveTags?: (props: unknown) => string[];
      };
      // liveId is stamped by the Vite plugin (hash of source path).
      // Fall back to a hash of the file path itself.
      const id = mod.liveId ?? filePath.replace(/[^a-z0-9]/gi, "").slice(-16);
      registerLiveComponent({
        id,
        modulePath: filePath,
        ...(typeof mod.liveInterval === "number" ? { liveInterval: mod.liveInterval } : {}),
        ...(typeof mod.liveTags === "function" ? { liveTags: mod.liveTags } : {}),
      });
    } catch (err) {
      console.warn(`[alabjs] live: failed to register ${filePath}:`, err);
    }
  }
}

/**
 * Find layout file paths (relative to cwd root) for a given route.file, ordered outermost→innermost.
 * Checks the compiled dist directory for the existence of each layout.
 */
/** Convert a TypeScript source path to its compiled .js equivalent. */
function toJsPath(p: string): string {
  return p.replace(/\.(tsx?)$/, ".js");
}

function findProdLayoutFiles(routeFile: string, distDir: string): string[] {
  // routeFile is like "app/users/[id]/page.tsx"
  // Returns source paths (e.g. "app/layout.tsx") so the client bootstrap can look
  // them up in LAYOUT_MODS by their original source key.  The import() call in
  // app.ts uses toJsPath() to convert back to the compiled .js path.
  const pageDir = dirname(routeFile);
  const parts = pageDir.split("/");
  const layouts: string[] = [];
  for (let i = 1; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    const compiledPath = `${dir}/layout.js`;
    if (existsSync(join(distDir, "server", compiledPath))) {
      layouts.push(`${dir}/layout.tsx`);
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
    const candidate = `${dir}/error.js`;
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
    const compiled = `${dir}/loading.js`;
    if (existsSync(join(distDir, "server", compiled))) return `${dir}/loading.tsx`;
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

  // Resolve the compiled client entry file path by reading the Vite manifest.
  // /@alabjs/client is a virtual module at build time; at runtime the server
  // must redirect requests for it to the hashed asset file.
  // The manifest key is a relative path ending in "@alabjs/client" (not "/@alabjs/client").
  let clientEntryPath = "";
  try {
    const viteManifest = JSON.parse(
      readFileSync(resolve(distDir, "client/.vite/manifest.json"), "utf8"),
    ) as Record<string, { file?: string; isEntry?: boolean; src?: string }>;
    const entry = Object.values(viteManifest).find(
      (e) => e.isEntry && e.src?.endsWith("@alabjs/client"),
    );
    if (entry?.file) clientEntryPath = "/" + entry.file;
  } catch { /* manifest absent — /@alabjs/client will 404 */ }

  // Load federation config written by `alab build`. Used to:
  //  1. Serve `/_alabjs/federation-manifest.json` (remote discovery)
  //  2. Inject `<script type="importmap">` into every page (host → remote routing)
  let federationConfig: FederationConfig | undefined;
  let importMapJson: string | null = null;
  try {
    const fedJson = readFileSync(resolve(distDir, "federation-config.json"), "utf8");
    federationConfig = JSON.parse(fedJson) as FederationConfig;
    importMapJson = buildImportMap(federationConfig, /* dev= */ false);
  } catch { /* no federation config — federation disabled */ }

  // Absolute path to the PPR shell cache directory.
  const pprCacheDir = resolve(distDir, "../../", PPR_CACHE_SUBDIR);

  // Register live components at startup (non-blocking — failures are warned, not thrown).
  registerAllLiveComponents(distDir).catch((err) => {
    console.warn("[alabjs] live: component registration failed:", err);
  });

  // ─── Global middleware ───────────────────────────────────────────────────────
  app.use(
    defineEventHandler((event) => {
      const res = event.node.res;
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("x-frame-options", "SAMEORIGIN");
      res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
      res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
      res.setHeader("x-permitted-cross-domain-policies", "none");
      // NOTE: 'unsafe-inline' is required by React's inline event delegation and
      // Tailwind's runtime style injection. 'unsafe-eval' is required by some
      // React dev-mode internals and dynamic import().
      //
      // ⚠️  Security implication: these directives weaken XSS protection.
      // In production, override this header in your middleware with a nonce-based
      // CSP: `script-src 'self' 'nonce-<random>'` and inject the same nonce into
      // every <script> tag via renderToResponse's headExtra option. The CSRF
      // double-submit pattern relies on XSS prevention — using 'unsafe-inline'
      // without a nonce makes the CSRF token readable by injected scripts.
      //
      // NOTE: 'upgrade-insecure-requests' is intentionally omitted from the
      // default CSP. That directive tells browsers to silently rewrite http://
      // sub-resource URLs to https://, which breaks any app served over plain
      // HTTP (local dev, internal tooling, HTTP-only staging servers) because
      // the browser will refuse to load scripts and stylesheets redirected from
      // the virtual /@alabjs/client path.
      //
      // Add it in your own middleware when you are certain every environment
      // runs behind HTTPS:
      //
      //   // middleware.ts
      //   export async function middleware(req: Request) {
      //     const isHttps = req.headers.get("x-forwarded-proto") === "https"
      //                  || new URL(req.url).protocol === "https:";
      //     if (isHttps) {
      //       // Append the directive to whatever CSP the framework already set.
      //       const existing = res.headers.get("content-security-policy") ?? "";
      //       res.headers.set(
      //         "content-security-policy",
      //         existing + "; upgrade-insecure-requests",
      //       );
      //     }
      //   }
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
        ].join("; "),
      );
      // HSTS — only meaningful over HTTPS; set in production only.
      res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
    }),
  );

  // ─── User middleware (middleware.ts compiled to dist/server/middleware.js) ───
  const middlewareModulePath = `${distDir}/server/middleware.js`;
  if (existsSync(middlewareModulePath)) {
    // Cache the module after first import — avoids redundant dynamic import()
    // overhead on every request (each import() call re-resolves the module graph).
    let _middlewareCache: MiddlewareModule | null = null;
    app.use(
      defineEventHandler(async (event) => {
        if (!_middlewareCache) {
          _middlewareCache = await import(middlewareModulePath) as MiddlewareModule;
        }
        const mod = _middlewareCache;
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
    defineEventHandler(async (event) => {
      const req = event.node.req;
      const res = event.node.res;
      if (req.method !== "GET" && req.method !== "HEAD") return;

      const rawPath = (req.url ?? "/").split("?")[0] ?? "/";
      // Decode and strip traversal attempts
      let relPath: string;
      try { relPath = decodeURIComponent(rawPath); } catch { return; }
      if (relPath.includes("..")) return;

      const acceptEncoding = (req.headers["accept-encoding"] ?? "") as string;
      const useBrotli = acceptEncoding.includes("br");
      const useGzip  = !useBrotli && acceptEncoding.includes("gzip");

      // Virtual client entry — redirect to the hashed asset file resolved at startup.
      // A 302 redirect (not direct serve) is critical: relative imports in the bundle
      // (e.g. "./components-HASH.js") must resolve against the real asset URL
      // (/assets/client-HASH.js), not the virtual path (/@alabjs/client).
      if (relPath === "/@alabjs/client") {
        if (clientEntryPath) {
          res.writeHead(302, { Location: clientEntryPath });
        } else {
          res.statusCode = 404;
        }
        res.end();
        return;
      }

      const ext = extname(relPath).toLowerCase();
      const contentType = MIME_TYPES[ext];
      if (!contentType) return; // skip extensionless paths (page routes)

      /** Stream a file with optional brotli/gzip compression and ETag 304 support.
       *
       * Returns a Promise that resolves when the response is fully sent. The
       * h3 handler awaits this promise so h3 knows the response is complete
       * before considering the next middleware. This avoids h3 passing the
       * request to the router (which would 404) while the async pipe is running.
       */
      function serveFile(
        filePath: string,
        fileSize: number,
        mtimeMs: number,
        cacheControl: string,
        mime: string,
      ): Promise<void> {
        // ETag from file size + mtime — both already known from the caller's stat().
        const etag = `"${fileSize.toString(36)}-${mtimeMs.toString(36)}"`;
        res.setHeader("etag", etag);
        res.setHeader("vary", "Accept-Encoding");

        if (req.headers["if-none-match"] === etag) {
          res.statusCode = 304;
          res.end();
          return Promise.resolve();
        }

        res.setHeader("content-type", mime);
        res.setHeader("cache-control", cacheControl);

        if (req.method === "HEAD") { res.end(); return Promise.resolve(); }

        return new Promise<void>((resolve, reject) => {
          const fileStream = createReadStream(filePath);
          res.on("finish", resolve);
          res.on("error", reject);
          if (useBrotli) {
            res.setHeader("content-encoding", "br");
            fileStream.pipe(createBrotliCompress()).pipe(res);
          } else if (useGzip) {
            res.setHeader("content-encoding", "gzip");
            fileStream.pipe(createGzip()).pipe(res);
          } else {
            res.setHeader("content-length", fileSize);
            fileStream.pipe(res);
          }
        });
      }

      // 1. Built client assets (JS chunks, CSS, source maps)
      const clientCandidate = join(clientDir, relPath);
      if (existsSync(clientCandidate)) {
        const stat = statSync(clientCandidate);
        if (stat.isFile()) {
          const isHashed = /\.[a-f0-9]{8,}\.[a-z]+$/.test(relPath);
          await serveFile(
            clientCandidate,
            stat.size,
            stat.mtimeMs,
            isHashed ? "public, max-age=31536000, immutable" : "public, max-age=3600",
            contentType,
          );
          return;
        }
      }

      // 2. Public directory (favicons, fonts, open-graph images, etc.)
      const publicCandidate = join(publicDir, relPath);
      if (existsSync(publicCandidate)) {
        const stat = statSync(publicCandidate);
        if (stat.isFile()) {
          await serveFile(publicCandidate, stat.size, stat.mtimeMs, "public, max-age=3600", contentType);
          return;
        }
      }
    }),
  );

  // ─── Built-in routes ────────────────────────────────────────────────────────

  // Federation manifest — remote apps can advertise what they expose
  router.get(
    "/_alabjs/federation-manifest.json",
    defineEventHandler((event) => {
      const res = event.node.res;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("cache-control", "no-store");

      const manifestPath = resolve(distDir, "client/_alabjs/federation-manifest.json");
      if (!existsSync(manifestPath)) {
        res.statusCode = 404;
        return JSON.stringify({ error: "No federation exposes configured." });
      }
      res.statusCode = 200;
      return readFileSync(manifestPath, "utf8");
    }),
  );

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

  // ─── Live component SSE endpoint ────────────────────────────────────────────
  // GET /_alabjs/live/:id?props=<base64-json>
  //
  // Opens a persistent SSE stream for a live component. On connect:
  //   1. Renders the component immediately and sends the first fragment.
  //   2. Sets up an interval (if liveInterval is set) to re-render and push.
  //   3. Subscribes to tag broadcasts (if liveTags is set).
  //   4. On client disconnect: clears interval + unsubscribes tags.
  router.get(
    "/_alabjs/live/:id",
    defineEventHandler(async (event) => {
      const req = event.node.req;
      const res = event.node.res;

      const id = (event.context.params?.["id"] ?? "") as string;
      const { getLiveComponent } = await import("../live/registry.js");
      const entry = getLiveComponent(id);

      if (!entry) {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: `[alabjs] live component not found: ${id}` }));
        return;
      }

      // Parse props from base64-encoded JSON query param.
      let props: unknown = {};
      try {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const raw = url.searchParams.get("props");
        if (raw) props = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
      } catch { /* malformed props — use empty object */ }

      // SSE headers.
      res.statusCode = 200;
      res.setHeader("content-type", "text/event-stream; charset=utf-8");
      res.setHeader("cache-control", "no-cache, no-transform");
      res.setHeader("connection", "keep-alive");
      res.setHeader("x-accel-buffering", "no"); // disable nginx buffering

      let lastHash = "";
      let closed = false;

      async function pushFragment(): Promise<void> {
        if (closed) return;
        try {
          const html = await renderLiveFragment(entry!.modulePath, props);
          const hash = hashFragment(html);
          if (hash === lastHash) return; // no-op — output unchanged
          lastHash = hash;
          res.write(`data: ${html}\n\n`);
        } catch (err) {
          console.error(`[alabjs] live render error (${id}):`, err);
        }
      }

      // Send initial fragment immediately.
      await pushFragment();

      // Interval-based polling.
      let intervalHandle: ReturnType<typeof setInterval> | null = null;
      if (entry.liveInterval && entry.liveInterval > 0) {
        intervalHandle = setInterval(() => { void pushFragment(); }, entry.liveInterval);
      }

      // Tag-based subscriptions.
      const unsubFns: Array<() => void> = [];
      if (entry.liveTags) {
        const tags = entry.liveTags(props);
        for (const tag of tags) {
          unsubFns.push(subscribeToTag(tag, () => { void pushFragment(); }));
        }
      }

      // Cleanup on disconnect.
      req.on("close", () => {
        closed = true;
        if (intervalHandle) clearInterval(intervalHandle);
        for (const unsub of unsubFns) unsub();
      });

      // Return null so h3 does not try to end the response — SSE keeps it open.
      return null;
    }),
  );

  // ─── Server function endpoints ──────────────────────────────────────────────
  // GET  /_alabjs/data/:fn  — used by useServerData (query params as input)
  // POST /_alabjs/fn/:fn    — used by useMutation (JSON body as input)
  //
  // Both scan all *.server.js files in dist/server for the named export.
  // Module results are NOT cached — the module cache is Node's own require cache.

  async function callServerFn(
    fnName: string,
    ctx: { params: Record<string, string>; query: Record<string, string>; headers: Record<string, string | string[] | undefined>; method: string; url: string },
    input: unknown,
    res: import("node:http").ServerResponse,
  ): Promise<void> {
    const serverFiles = findDistServerFiles(distDir);
    for (const file of serverFiles) {
      const mod = await import(file) as Record<string, unknown>;
      if (typeof mod[fnName] === "function") {
        try {
          const result = await (mod[fnName] as (c: unknown, i: unknown) => Promise<unknown>)(ctx, input);
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result));
        } catch (err) {
          const zodError = (err as Record<string, unknown>)?.["zodError"];
          if (zodError) {
            res.statusCode = 422;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ zodError }));
          } else {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[alabjs] server fn "${fnName}" threw:`, err);
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: msg }));
          }
        }
        return;
      }
    }
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: `[alabjs] server function not found: ${fnName}` }));
  }

  router.get(
    "/_alabjs/data/:fn",
    defineEventHandler(async (event) => {
      const fnName = event.context.params?.["fn"] ?? "";
      const req = event.node.req;
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const query = Object.fromEntries(url.searchParams.entries());
      const ctx = {
        params: query,
        query,
        headers: req.headers as Record<string, string>,
        method: "GET",
        url: req.url ?? "/",
      };
      await callServerFn(fnName, ctx, Object.keys(query).length ? query : undefined, event.node.res);
    }),
  );

  router.post(
    "/_alabjs/fn/:fn",
    defineEventHandler(async (event) => {
      const fnName = event.context.params?.["fn"] ?? "";
      const req = event.node.req;
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const query = Object.fromEntries(url.searchParams.entries());
      const body = await readBody(event);
      const ctx = {
        params: query,
        query,
        headers: req.headers as Record<string, string>,
        method: "POST",
        url: req.url ?? "/",
      };
      await callServerFn(fnName, ctx, body, event.node.res);
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
    const apiModulePath = `${distDir}/server/${toJsPath(route.file)}`;

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
        const pageModulePath = `${distDir}/server/${toJsPath(route.file)}`;
        const mod = await import(pageModulePath) as {
          default?: unknown;
          metadata?: PageMetadata;
          generateMetadata?: (props: { params: Record<string, string>; searchParams: Record<string, string> }) => PageMetadata | Promise<PageMetadata>;
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
            ? await mod.generateMetadata({ params, searchParams })
            : (mod.metadata ?? {});

        const ssrEnabled = mod.ssr === true;

        // ── Layouts ──────────────────────────────────────────────────────────
        const layoutRelPaths = findProdLayoutFiles(route.file, distDir);
        const layoutMods = await Promise.all(
          layoutRelPaths.map((p) => import(`${distDir}/server/${toJsPath(p)}`)),
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
            ...(importMapJson ? { importMapJson } : {}),
          });
        } catch (err) {
          // ── error.tsx fallback ────────────────────────────────────────────
          const errorRelPath = findProdErrorFile(route.file, distDir);
          if (errorRelPath) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const errorMod = await import(`${distDir}/server/${toJsPath(errorRelPath)}`) as any;
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
                  ...(importMapJson ? { importMapJson } : {}),
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
  const notFoundPath = `${distDir}/server/app/not-found.js`;
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
              ...(importMapJson ? { importMapJson } : {}),
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
      // Make the server's base URL available to useServerData during SSR so it
      // can construct an absolute URL for its internal loop-back fetch.
      process.env["ALAB_ORIGIN"] = `http://127.0.0.1:${port}`;
      const server = createServer(toNodeListener(app));
      server.listen(port, "0.0.0.0", () => {
        console.log(`  alab  ready at http://localhost:${port}`);
      });
    },
  };
}
