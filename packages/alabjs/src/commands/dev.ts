import { createServer } from "vite";
import { resolve, join } from "node:path";
import { readdirSync } from "node:fs";
import { Writable } from "node:stream";
import type { IncomingMessage } from "node:http";
import {
  scanDevRoutes, matchDevRoute,
  findLayoutFiles, findErrorFile, findLoadingFile,
  scanDevApiRoutes, matchDevApiRoute,
} from "../ssr/router-dev.js";
import { htmlShellBefore, htmlShellAfter } from "../ssr/html.js";
import { generateSitemap } from "../server/sitemap.js";
import { handleImageRequest } from "../server/image.js";
import type { MiddlewareModule } from "../server/middleware.js";
import { runMiddleware } from "../server/middleware.js";
import {
  getCachedPage, setCachedPage, markPageRevalidating, isPageRevalidating,
} from "../server/cache.js";
import { checkRevalidateAuth, applyRevalidate } from "../server/revalidate.js";
import type { PageMetadata } from "../types/index.js";
import type { Route } from "../router/manifest.js";

interface DevOptions {
  cwd: string;
  port?: number;
  host?: string;
}

/** Recursively find all *.server.ts / *.server.tsx files under a directory. */
function findServerFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findServerFiles(full));
      } else if (/\.server\.(ts|tsx)$/.test(entry.name)) {
        results.push(full);
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(`[alabjs] warning: failed to scan ${dir}:`, (err as Error).message ?? err);
    }
  }
  return results;
}

/** Read and JSON-parse the request body. Returns undefined on empty or invalid JSON. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve(undefined); }
    });
    req.on("error", () => resolve(undefined));
  });
}

export async function dev({ cwd, port = 3000, host = "localhost" }: DevOptions) {
  console.log("  alab  starting dev server...\n");

  // Per-session build ID for skew protection in dev.
  // A new ID is generated each time the dev server starts so that a browser
  // tab left open across a restart will hard-reload on the next navigation
  // rather than silently rendering with stale JS.
  const devBuildId = `dev-${Date.now().toString(36)}`;

  const appDir = resolve(cwd, "app");

  const vite = await createServer({
    root: cwd,
    appType: "custom",
    server: { port, host },
    plugins: [
      (await import("alabjs-vite-plugin")).alabPlugin(),
    ],
    ssr: {
      // Externalize react packages so Node.js loads them natively (avoids
      // CJS/ESM mismatch in Vite's module runner for react-dom/server).
      external: ["react", "react-dom", "react-dom/server", "react-dom/server.node"],
      noExternal: ["alab", "alabjs-vite-plugin"],
    },
  });

  // ─── Alab SSR + built-in route middleware ────────────────────────────────────
  vite.middlewares.use(async (req, res, next) => {
    const rawUrl = req.url ?? "/";
    const pathname = rawUrl.split("?")[0] ?? "/";

    // Pass Vite-internal requests through
    if (
      pathname.startsWith("/@") ||
      pathname.startsWith("/__vite") ||
      pathname.startsWith("/node_modules") ||
      pathname.startsWith("/@alab")
    ) {
      return next();
    }

    // Apply security headers to every alab-handled response.
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "SAMEORIGIN");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("x-permitted-cross-domain-policies", "none");

    try {
      // ── User middleware (middleware.ts at project root) ───────────────────────
      const middlewareFile = resolve(cwd, "middleware.ts");
      const { existsSync: fsExists } = await import("node:fs");
      if (fsExists(middlewareFile)) {
        const middlewareMod = await vite.ssrLoadModule(middlewareFile) as MiddlewareModule;
        if (typeof middlewareMod.middleware === "function") {
          const url = new URL(rawUrl, `http://${host}:${port}`);
          const webReq = new Request(url.toString(), {
            method: req.method ?? "GET",
            headers: req.headers as HeadersInit,
          });
          const middlewareRes = await runMiddleware(middlewareMod, webReq);
          if (middlewareRes) {
            res.statusCode = middlewareRes.status;
            middlewareRes.headers.forEach((v, k) => res.setHeader(k, v));
            res.end(Buffer.from(await middlewareRes.arrayBuffer()));
            return;
          }
        }
      }

      // ── /_alabjs/data/:fnName — GET data from a defineServerFn (useServerData) ─
      // ── /_alabjs/fn/:fnName  — POST mutation via defineServerFn stub ───────────
      if (pathname.startsWith("/_alabjs/data/") || pathname.startsWith("/_alabjs/fn/")) {
        const fnName = pathname.startsWith("/_alabjs/data/")
          ? pathname.slice("/_alabjs/data/".length)
          : pathname.slice("/_alabjs/fn/".length);

        const serverFiles = findServerFiles(appDir);
        let found = false;
        for (const file of serverFiles) {
          const mod = await vite.ssrLoadModule(file);
          if (typeof mod[fnName] === "function") {
            found = true;
            const url = new URL(rawUrl, `http://${host}:${port}`);
            const params = Object.fromEntries(url.searchParams.entries());
            const input = req.method === "POST" ? await readJsonBody(req) : undefined;
            const ctx = {
              params,
              query: params,
              headers: req.headers as Record<string, string>,
              method: (req.method ?? "GET").toUpperCase() as "GET" | "POST",
              url: rawUrl,
            };
            try {
              const result = await (mod[fnName] as (c: unknown, i: unknown) => Promise<unknown>)(ctx, input);
              res.statusCode = 200;
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err) {
              // Zod validation errors from defineServerFn get HTTP 422
              const zodError = (err as Record<string, unknown>)?.["zodError"];
              if (zodError) {
                res.statusCode = 422;
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ zodError }));
              } else {
                res.statusCode = 500;
                res.setHeader("content-type", "application/json");
                const msg = err instanceof Error ? err.message : String(err);
              res.end(JSON.stringify({ error: msg }));
              }
            }
            break;
          }
        }
        if (!found) {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: `[alabjs] server function not found: ${fnName}` }));
        }
        return;
      }

      // ── /_alabjs/image — Rust-powered image optimisation ───────────────────────
      if (pathname === "/_alabjs/image") {
        const publicDir = resolve(cwd, "public");
        await handleImageRequest(req, res, publicDir);
        return;
      }

      // ── /sitemap.xml ────────────────────────────────────────────────────────
      if (pathname === "/sitemap.xml") {
        const devRoutes = scanDevRoutes(appDir);
        const manifestRoutes: Route[] = devRoutes.map((r) => ({
          path: r.file
            .replace(appDir, "")
            .replace(/\/page\.(tsx|ts)$/, "") || "/",
          file: r.file.replace(cwd + "/", ""),
          kind: "page" as const,
          ssr: r.ssr,
          params: r.paramNames,
        }));
        const xml = generateSitemap(manifestRoutes, `http://${host}:${port}`);
        res.statusCode = 200;
        res.setHeader("content-type", "application/xml; charset=utf-8");
        res.end(xml);
        return;
      }

      // ── On-demand ISR revalidation ────────────────────────────────────────────
      if (pathname === "/_alabjs/revalidate") {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("allow", "POST");
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Method Not Allowed" }));
          return;
        }
        if (!checkRevalidateAuth(req.headers["authorization"])) {
          res.statusCode = 401;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Unauthorized. Set Authorization: Bearer <ALAB_REVALIDATE_SECRET>." }));
          return;
        }
        const chunks: Buffer[] = [];
        await new Promise<void>((ok) => {
          req.on("data", (c: Buffer) => chunks.push(c));
          req.on("end", ok);
        });
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString()); }
        catch { body = null; }
        const result = applyRevalidate(body);
        res.statusCode = "error" in result ? result.status : 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify("error" in result ? { error: result.error } : result));
        return;
      }

      // ── API routes (route.ts) ─────────────────────────────────────────────────
      const apiRoutes = scanDevApiRoutes(appDir);
      const matchedApi = matchDevApiRoute(apiRoutes, pathname);
      if (matchedApi) {
        const apiMod = await vite.ssrLoadModule(matchedApi.route.file) as Record<string, unknown>;
        const method = (req.method ?? "GET").toUpperCase();
        const handler = apiMod[method];
        if (typeof handler !== "function") {
          res.statusCode = 405;
          res.setHeader("allow", Object.keys(apiMod).filter(k => /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(k)).join(", "));
          res.end("Method Not Allowed");
          return;
        }
        const url = new URL(rawUrl, `http://${host}:${port}`);
        const chunks: Buffer[] = [];
        await new Promise<void>((ok) => {
          req.on("data", (c: Buffer) => chunks.push(c));
          req.on("end", ok);
        });
        const body = chunks.length ? Buffer.concat(chunks) : null;
        const webReq = new Request(url.toString(), {
          method,
          headers: req.headers as HeadersInit,
          body: body?.length ? body : null,
        });
        const webRes = await (handler as (r: Request) => Promise<Response>)(webReq);
        res.statusCode = webRes.status;
        webRes.headers.forEach((v, k) => res.setHeader(k, v));

        // SSE: pipe the ReadableStream body without buffering.
        if (
          (webRes.headers.get("content-type") ?? "").startsWith("text/event-stream") &&
          webRes.body
        ) {
          const reader = webRes.body.getReader();
          res.on("close", () => { void reader.cancel(); });
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done || res.destroyed) break;
              res.write(value);
            }
          } catch { /* client disconnected */ } finally {
            res.end();
          }
          return;
        }

        res.end(Buffer.from(await webRes.arrayBuffer()));
        return;
      }

      // ── Page routes ──────────────────────────────────────────────────────────
      const routes = scanDevRoutes(appDir);
      const matched = matchDevRoute(routes, pathname);

      // ── Not-found page ────────────────────────────────────────────────────────
      if (!matched) {
        const wantsHtml = (req.headers["accept"] ?? "").includes("text/html");
        if (!wantsHtml) return next();

        const notFoundFile = resolve(appDir, "not-found.tsx");
        const { existsSync } = await import("node:fs");
        if (existsSync(notFoundFile)) {
          const nfMod = await vite.ssrLoadModule(notFoundFile) as Record<string, unknown>;
          const NotFound = nfMod["default"];
          if (typeof NotFound === "function") {
            const { createElement } = await import("react") as { createElement: (t: unknown, p: unknown) => unknown };
            const { renderToPipeableStream } = await import("react-dom/server.node") as {
              renderToPipeableStream: (el: unknown, opts: { onAllReady: () => void; onError: (e: unknown) => void }) => { pipe: (d: Writable) => void };
            };
            const nfContent = await new Promise<string>((ok, fail) => {
              let html = "";
              const sink = new Writable({
                write(chunk: Buffer, _enc: string, cb: () => void) { html += chunk.toString(); cb(); },
              });
              sink.on("finish", () => ok(html));
              const { pipe } = renderToPipeableStream(createElement(NotFound, {}), {
                onAllReady() { pipe(sink); },
                onError(e) { fail(e); },
              });
            });
            const shell = htmlShellBefore({ metadata: { title: "404 — Not Found" }, paramsJson: "{}", searchParamsJson: "{}", routeFile: "app/not-found.tsx", ssr: true });
            const rawHtml = `${shell}${nfContent}${htmlShellAfter({})}`;
            const html = await vite.transformIndexHtml(pathname, rawHtml);
            res.statusCode = 404;
            res.setHeader("content-type", "text/html; charset=utf-8");
            res.end(html);
            return;
          }
        }
        return next();
      }

      const { route, params } = matched;

      const mod = await vite.ssrLoadModule(route.file) as {
        default?: unknown;
        metadata?: PageMetadata;
        generateMetadata?: (params: Record<string, string>) => PageMetadata | Promise<PageMetadata>;
        ssr?: boolean;
        /** ISR: seconds before a cached page is considered stale. Omit to disable caching. */
        revalidate?: number;
      };

      const Page = mod.default;
      if (typeof Page !== "function") {
        vite.ssrFixStacktrace(new Error(`[alabjs] Page module has no default export: ${route.file}`));
        return next();
      }

      // Support both static `export const metadata` and dynamic `export async function generateMetadata`.
      const metadata: PageMetadata =
        typeof mod.generateMetadata === "function"
          ? await mod.generateMetadata(params)
          : (mod.metadata ?? {});

      // Make the server's base URL available to useServerData during SSR,
      // so it can construct an absolute URL for its internal fetch call.
      process.env["ALAB_ORIGIN"] = `http://${host}:${port}`;

      const ssrEnabled = mod.ssr === true;

      const searchParams = Object.fromEntries(
        new URLSearchParams(rawUrl.includes("?") ? rawUrl.split("?")[1] : "").entries(),
      );

      // ── Layouts + loading file ────────────────────────────────────────────────
      const layoutFiles = findLayoutFiles(route.file, appDir);
      const layoutMods = await Promise.all(layoutFiles.map((f) => vite.ssrLoadModule(f)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layoutComponents = layoutMods.map((m) => m["default"]).filter((c): c is any => typeof c === "function");
      const layoutsJson = JSON.stringify(layoutFiles.map((f) => f.replace(cwd + "/", "")));
      const loadingFileAbs = findLoadingFile(route.file, appDir);
      const loadingFile = loadingFileAbs ? loadingFileAbs.replace(cwd + "/", "") : undefined;

      const { renderToPipeableStream } = await import("react-dom/server.node") as {
        renderToPipeableStream: (el: unknown, opts: {
          onAllReady: () => void;
          onError: (err: unknown) => void;
        }) => { pipe: (dest: Writable) => void };
      };
      const { createElement } = await import("react") as {
        createElement: (type: unknown, props: unknown, ...children: unknown[]) => unknown;
      };

      // Clear SSR promise cache so each request gets fresh data but re-renders
      // within the same renderToPipeableStream pass reuse the same promise.
      const alabClient = await vite.ssrLoadModule("alabjs/client") as {
        _clearALabSSRCache?: () => void;
      };
      alabClient._clearALabSSRCache?.();

      // Build element tree: Page wrapped by layouts outermost→innermost
      const buildTree = (PageComp: unknown): unknown => {
        let el = createElement(PageComp, { params, searchParams });
        for (let i = layoutComponents.length - 1; i >= 0; i--) {
          el = createElement(layoutComponents[i], {}, el);
        }
        return el;
      };

      let ssrContent = "";
      if (ssrEnabled) {
        try {
          ssrContent = await new Promise<string>((ok, fail) => {
            let html = "";
            const sink = new Writable({
              write(chunk: Buffer, _enc: string, cb: () => void) {
                html += chunk.toString();
                cb();
              },
            });
            sink.on("finish", () => ok(html));
            const { pipe } = renderToPipeableStream(buildTree(Page), {
              onAllReady() { pipe(sink); },
              onError(err) { fail(err); },
            });
          });
        } catch (ssrErr) {
          // ── error.tsx fallback ──────────────────────────────────────────────
          const errorFile = findErrorFile(route.file, appDir);
          if (errorFile) {
            try {
              const errorMod = await vite.ssrLoadModule(errorFile) as Record<string, unknown>;
              const ErrorPage = errorMod["default"];
              if (typeof ErrorPage === "function") {
                ssrContent = await new Promise<string>((ok, fail) => {
                  let html = "";
                  const sink = new Writable({
                    write(chunk: Buffer, _enc: string, cb: () => void) { html += chunk.toString(); cb(); },
                  });
                  sink.on("finish", () => ok(html));
                  const { pipe } = renderToPipeableStream(
                    createElement(ErrorPage, { error: ssrErr, reset: () => {} }),
                    { onAllReady() { pipe(sink); }, onError(e) { fail(e); } },
                  );
                });
              }
            } catch (errorPageErr) {
              console.error("[alabjs] error.tsx SSR render failed:", errorPageErr);
              // fall through to plain text error
            }
          }
          if (!ssrContent) {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end(`[alabjs] SSR error: ${String(ssrErr)}`);
            return;
          }
        }
      }

      const routeFile = route.file.replace(cwd, "").replace(/^\//, "");

      // ── Render helper (used for both fresh render + background revalidation) ─
      const revalidateSecs = typeof mod.revalidate === "number" ? mod.revalidate : null;
      const renderPageHtml = async (): Promise<string> => {
        const shellBefore = htmlShellBefore({
          metadata,
          paramsJson: JSON.stringify(params),
          searchParamsJson: JSON.stringify(searchParams),
          routeFile,
          layoutsJson,
          loadingFile,
          ssr: ssrEnabled,
          buildId: devBuildId,
        });
        const shellAfter = htmlShellAfter({});
        const rawHtml = `${shellBefore}${ssrContent}${shellAfter}`;
        return vite.transformIndexHtml(pathname, rawHtml);
      };

      // ── ISR: serve cached page if available ──────────────────────────────────
      if (revalidateSecs !== null) {
        const cached = getCachedPage(pathname);
        if (cached) {
          res.statusCode = 200;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.setHeader("x-alab-cache", cached.stale ? "stale" : "hit");
          res.end(cached.html);
          // Background revalidation for stale entries
          if (cached.stale && !isPageRevalidating(pathname)) {
            markPageRevalidating(pathname);
            void renderPageHtml().then((fresh) => {
              setCachedPage(pathname, fresh, revalidateSecs);
            }).catch((revalErr: unknown) => {
              console.warn(`[alabjs] ISR revalidation failed for ${pathname}:`, revalErr);
            });
          }
          return;
        }
      }

      const html = await renderPageHtml();

      // Store in ISR cache if page exports `revalidate`
      if (revalidateSecs !== null) {
        setCachedPage(pathname, html, revalidateSecs);
      }

      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      if (revalidateSecs !== null) res.setHeader("x-alab-cache", "miss");
      res.end(html);
    } catch (err) {
      console.error(`[alabjs] unhandled error on ${pathname}:`, err);
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });

  await vite.listen();
  vite.printUrls();
}
