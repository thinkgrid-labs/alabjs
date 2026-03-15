import { createServer } from "vite";
import { resolve } from "node:path";
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
        ssr?: boolean;
      };

      const Page = mod.default;
      if (typeof Page !== "function") {
        vite.ssrFixStacktrace(new Error(`[alab] Page module has no default export: ${route.file}`));
        return next();
      }

      const metadata: PageMetadata = mod.metadata ?? {};
      const ssrEnabled = mod.ssr !== false;

      const searchParams = Object.fromEntries(
        new URLSearchParams(rawUrl.includes("?") ? rawUrl.split("?")[1] : "").entries(),
      );

      const { renderToString: reactRenderToString } = await vite.ssrLoadModule("react-dom/server") as {
        renderToString: (el: unknown) => string;
      };
      const { createElement } = await vite.ssrLoadModule("react") as {
        createElement: (type: unknown, props: unknown) => unknown;
      };

      const ssrContent = ssrEnabled
        ? reactRenderToString(createElement(Page, { params, searchParams }))
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
