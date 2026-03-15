import { createServer } from "vite";
import { resolve, join } from "node:path";
import { readdirSync } from "node:fs";
import { Writable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { scanDevRoutes, matchDevRoute } from "../ssr/router-dev.js";
import { htmlShellBefore, htmlShellAfter } from "../ssr/html.js";
import { generateSitemap } from "../server/sitemap.js";
import { handleImageRequest } from "../server/image.js";
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
  } catch { /* dir may not exist */ }
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

  const appDir = resolve(cwd, "app");

  const vite = await createServer({
    root: cwd,
    appType: "custom",
    server: { port, host },
    plugins: [
      (await import("alab-vite-plugin")).alabPlugin(),
    ],
    ssr: {
      // Externalize react packages so Node.js loads them natively (avoids
      // CJS/ESM mismatch in Vite's module runner for react-dom/server).
      external: ["react", "react-dom", "react-dom/server", "react-dom/server.node"],
      noExternal: ["alab", "alab-vite-plugin"],
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

    try {
      // ── /_alab/data/:fnName — GET data from a defineServerFn (useServerData) ─
      // ── /_alab/fn/:fnName  — POST mutation via defineServerFn stub ───────────
      if (pathname.startsWith("/_alab/data/") || pathname.startsWith("/_alab/fn/")) {
        const fnName = pathname.startsWith("/_alab/data/")
          ? pathname.slice("/_alab/data/".length)
          : pathname.slice("/_alab/fn/".length);

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
              res.statusCode = 500;
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify({ error: String(err) }));
            }
            break;
          }
        }
        if (!found) {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: `[alab] server function not found: ${fnName}` }));
        }
        return;
      }

      // ── /_alab/image — Rust-powered image optimisation ───────────────────────
      if (pathname === "/_alab/image") {
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

      // ── Page routes ──────────────────────────────────────────────────────────
      const routes = scanDevRoutes(appDir);
      const matched = matchDevRoute(routes, pathname);

      if (!matched) return next();

      const { route, params } = matched;

      const mod = await vite.ssrLoadModule(route.file) as {
        default?: unknown;
        metadata?: PageMetadata;
        generateMetadata?: (params: Record<string, string>) => PageMetadata | Promise<PageMetadata>;
        ssr?: boolean;
      };

      const Page = mod.default;
      if (typeof Page !== "function") {
        vite.ssrFixStacktrace(new Error(`[alab] Page module has no default export: ${route.file}`));
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

      const ssrEnabled = mod.ssr !== false;

      const searchParams = Object.fromEntries(
        new URLSearchParams(rawUrl.includes("?") ? rawUrl.split("?")[1] : "").entries(),
      );

      const { renderToPipeableStream } = await import("react-dom/server.node") as {
        renderToPipeableStream: (el: unknown, opts: {
          onAllReady: () => void;
          onError: (err: unknown) => void;
        }) => { pipe: (dest: Writable) => void };
      };
      const { createElement } = await import("react") as {
        createElement: (type: unknown, props: unknown) => unknown;
      };

      // Clear SSR promise cache so each request gets fresh data but re-renders
      // within the same renderToPipeableStream pass reuse the same promise.
      const alabClient = await vite.ssrLoadModule("alab/client") as {
        _clearALabSSRCache?: () => void;
      };
      alabClient._clearALabSSRCache?.();

      const ssrContent = ssrEnabled
        ? await new Promise<string>((ok, fail) => {
            let html = "";
            const sink = new Writable({
              write(chunk: Buffer, _enc: string, cb: () => void) {
                html += chunk.toString();
                cb();
              },
            });
            sink.on("finish", () => ok(html));
            const { pipe } = renderToPipeableStream(
              createElement(Page, { params, searchParams }),
              {
                onAllReady() { pipe(sink); },
                onError(err) { fail(err); },
              },
            );
          })
        : "";

      const routeFile = route.file.replace(cwd, "").replace(/^\//, "");
      const shellBefore = htmlShellBefore({
        metadata,
        paramsJson: JSON.stringify(params),
        searchParamsJson: JSON.stringify(searchParams),
        routeFile,
        ssr: ssrEnabled,
      });
      const shellAfter = htmlShellAfter({});

      const rawHtml = `${shellBefore}${ssrContent}${shellAfter}`;
      const html = await vite.transformIndexHtml(pathname, rawHtml);

      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("x-frame-options", "SAMEORIGIN");
      res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
      res.end(html);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });

  await vite.listen();
  vite.printUrls();
}
