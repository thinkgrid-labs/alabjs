import { createServer } from "vite";
import { resolve } from "node:path";
import { scanDevRoutes, matchDevRoute } from "../ssr/router-dev.js";
import { htmlShellBefore, htmlShellAfter } from "../ssr/html.js";
import type { PageMetadata } from "../types/index.js";

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
    // "custom" disables Vite's built-in HTML serving so our middleware takes over.
    appType: "custom",
    server: { port, host },
    plugins: [
      // Alab Rust compiler + boundary checker + virtual client entry
      (await import("alab-vite-plugin")).alabPlugin(),
    ],
    // Tailwind v4 is registered by alab-vite-plugin — no manual CSS import needed.
  });

  // ─── Alab SSR middleware ─────────────────────────────────────────────────────
  vite.middlewares.use(async (req, res, next) => {
    const rawUrl = req.url ?? "/";
    // Strip query string for route matching
    const pathname = rawUrl.split("?")[0] ?? "/";

    // Let Vite handle its own internal requests
    if (
      pathname.startsWith("/@") ||
      pathname.startsWith("/__vite") ||
      pathname.startsWith("/node_modules") ||
      pathname.startsWith("/@alab")
    ) {
      return next();
    }

    try {
      // Scan app/ on every request in dev (instant, no caching needed)
      const routes = scanDevRoutes(appDir);
      const matched = matchDevRoute(routes, pathname);

      if (!matched) {
        // No page matches — let Vite serve static assets or return 404
        return next();
      }

      const { route, params } = matched;

      // Load the page module through Vite's SSR module graph (enables HMR)
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
      const ssrEnabled = mod.ssr !== false; // default: SSR on

      const searchParams = Object.fromEntries(
        new URLSearchParams(rawUrl.includes("?") ? rawUrl.split("?")[1] : "").entries(),
      );

      // Render the page component to an HTML string via React
      const { renderToString: reactRenderToString } = await vite.ssrLoadModule("react-dom/server") as {
        renderToString: (el: unknown) => string;
      };
      const { createElement } = await vite.ssrLoadModule("react") as {
        createElement: (type: unknown, props: unknown) => unknown;
      };

      const ssrContent = ssrEnabled
        ? reactRenderToString(createElement(Page, { params, searchParams }))
        : "";

      // Build the HTML shell. Vite's `transformIndexHtml` will inject the HMR
      // client and any other plugin-injected tags (including Tailwind in dev).
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

      // Let Vite plugins transform the HTML (injects HMR client, Tailwind, etc.)
      const html = await vite.transformIndexHtml(pathname, rawHtml);

      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      // Security headers by default
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
