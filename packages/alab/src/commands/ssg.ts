/**
 * `alab ssg` — Static Site Generation
 *
 * Pre-renders all static routes (no dynamic `[param]` segments) to HTML files
 * at build time. Output lands in `dist/` and can be served from any static
 * host: Netlify, GitHub Pages, Cloudflare Pages, S3, etc.
 *
 * Dynamic routes (`/users/[id]`) are skipped — they require a running server.
 * To pre-render dynamic pages, export `export const staticPaths = [...]` from
 * the page module (planned for a future release).
 */
import { createServer } from "vite";
import { resolve, join } from "node:path";
import { mkdir, writeFile, cp } from "node:fs/promises";
import { scanDevRoutes } from "../ssr/router-dev.js";
import { htmlShellBefore, htmlShellAfter } from "../ssr/html.js";
import type { PageMetadata } from "../types/index.js";

interface SsgOptions {
  cwd: string;
  /** Output directory. Defaults to `dist`. */
  outDir?: string;
}

export async function ssg({ cwd, outDir = "dist" }: SsgOptions) {
  const appDir = resolve(cwd, "app");
  const publicDir = resolve(cwd, "public");
  const outputDir = resolve(cwd, outDir);

  console.log(`  alab  generating static site → ${outDir}/\n`);

  // Spin up a Vite SSR server (no HTTP listener — port 0, ephemeral).
  const vite = await createServer({
    root: cwd,
    appType: "custom",
    server: { port: 0 },
    plugins: [(await import("alab-vite-plugin")).alabPlugin()],
  });

  const allRoutes = scanDevRoutes(appDir);

  // Only generate pages with no dynamic params — dynamic routes need a server.
  const staticRoutes = allRoutes.filter((r) => r.paramNames.length === 0);
  const skipped = allRoutes.length - staticRoutes.length;

  await mkdir(outputDir, { recursive: true });

  let written = 0;
  for (const route of staticRoutes) {
    const mod = (await vite.ssrLoadModule(route.file)) as {
      default?: unknown;
      metadata?: PageMetadata;
      ssr?: boolean;
    };

    const Page = mod.default;
    if (typeof Page !== "function") {
      console.warn(`  alab  [ssg] skip ${route.file} — no default export`);
      continue;
    }

    // Load React server renderer via Vite (ensures HMR-aware module graph).
    const { renderToString: reactRenderToString } = (await vite.ssrLoadModule(
      "react-dom/server",
    )) as { renderToString: (el: unknown) => string };
    const { createElement } = (await vite.ssrLoadModule("react")) as {
      createElement: (type: unknown, props: unknown) => unknown;
    };

    const ssrContent = reactRenderToString(
      createElement(Page, { params: {}, searchParams: {} }),
    );

    // Derive the URL path from the file path.
    const urlPath =
      route.file
        .replace(appDir, "")
        .replace(/\/page\.(tsx|ts)$/, "") || "/";

    // Build the output file path: /about → dist/about/index.html
    const segments = urlPath === "/" ? [] : urlPath.split("/").filter(Boolean);
    const pageOutputDir = join(outputDir, ...segments);
    await mkdir(pageOutputDir, { recursive: true });
    const outputFile = join(pageOutputDir, "index.html");

    const routeFile = route.file.replace(cwd, "").replace(/^\//, "");
    const shellBefore = htmlShellBefore({
      metadata: mod.metadata ?? {},
      paramsJson: "{}",
      searchParamsJson: "{}",
      routeFile,
      ssr: true,
    });
    const shellAfter = htmlShellAfter({});

    await writeFile(outputFile, `${shellBefore}${ssrContent}${shellAfter}`, "utf8");
    console.log(`  alab  [ssg] ${urlPath.padEnd(30)} → ${outputFile.replace(cwd + "/", "")}`);
    written++;
  }

  // Copy public/ assets into the output directory.
  try {
    await cp(publicDir, join(outputDir, "public"), { recursive: true });
    console.log(`\n  alab  [ssg] copied public/ assets`);
  } catch {
    // public/ may not exist — not an error.
  }

  await vite.close();

  console.log(
    `\n  alab  ${written} page${written === 1 ? "" : "s"} written` +
      (skipped > 0 ? `, ${skipped} dynamic route${skipped === 1 ? "" : "s"} skipped` : "") +
      `\n`,
  );
}
