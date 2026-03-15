import { build as viteBuild, type PluginOption } from "vite";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";

interface BuildOptions {
  cwd: string;
  /** Skip TypeScript type checking (--skip-typecheck flag). */
  skipTypecheck?: boolean;
  /**
   * Build mode:
   * - `"ssr"` (default) — full SSR + client bundle, requires a Node.js server.
   * - `"spa"` — pure client-side bundle, deployable to any CDN. No Node.js needed.
   *   Server functions become direct fetch calls to `/_alab/fn/*`; point these at
   *   a separate API server or use Cloudflare Workers for the data layer.
   */
  mode?: "ssr" | "spa";
  /** Open an interactive bundle size treemap after build (`--analyze`). */
  analyze?: boolean;
}

/** Run `tsc --noEmit` in the project and resolve when it exits. */
function runTypecheck(cwd: string): Promise<void> {
  return new Promise((ok, fail) => {
    const tscPath = resolve(cwd, "node_modules/.bin/tsc");
    const bin = existsSync(tscPath) ? tscPath : "tsc";
    const child = spawn(bin, ["--noEmit"], { cwd, stdio: "inherit", shell: true });
    child.on("close", (code) => {
      if (code === 0) ok();
      else fail(new Error(`[alab] TypeScript type errors found (tsc --noEmit exited ${code})`));
    });
    child.on("error", fail);
  });
}

/**
 * SPA mode: emit a single index.html shell + hashed client assets.
 * No SSR build step — React hydrates from scratch on the client.
 */
async function buildSpa(cwd: string): Promise<void> {
  const outDir = resolve(cwd, ".alab/dist/spa");

  await viteBuild({
    root: cwd,
    plugins: [(await import("alab-vite-plugin")).alabPlugin({ mode: "build" })],
    build: {
      outDir,
      // Client-only — no SSR entry, no server manifest needed.
      ssrManifest: false,
      rolldownOptions: {
        // The virtual /@alab/client module is the app entry.
        // For SPA mode we generate a real index.html that loads it.
        input: resolve(cwd, "index.html"),
      },
    },
  });

  // Emit a minimal index.html if the project doesn't have one.
  // The virtual /@alab/client module handles routing client-side.
  const indexPath = resolve(cwd, "index.html");
  if (!existsSync(indexPath)) {
    const spa = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/app/globals.css" />
  </head>
  <body>
    <div id="alab-root"></div>
    <script type="module" src="/@alab/client"></script>
  </body>
</html>`;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "index.html"), spa, "utf8");
  }

  console.log("\n  alab  SPA build complete → .alab/dist/spa");
  console.log("  alab  deploy the spa/ directory to any static host (Netlify, GitHub Pages, S3)\n");
}

export async function build({ cwd, skipTypecheck = false, mode = "ssr", analyze = false }: BuildOptions) {
  if (mode === "spa") {
    console.log("  alab  building SPA (client-only)...\n");
    const tasks: Promise<unknown>[] = [buildSpa(cwd)];
    if (!skipTypecheck) {
      console.log("  alab  type-checking...");
      tasks.push(runTypecheck(cwd));
    }
    await Promise.all(tasks);
    return;
  }

  console.log("  alab  building for production...\n");

  // Run type checking and Vite bundling in parallel.
  // Type errors abort the build before wrangler/deploy picks up bad output.

  // Bundle visualizer — try rolldown-plugin-visualizer first (faster, Rust-native),
  // fall back to rollup-plugin-visualizer (same API, works on both bundlers).
  let visualizerPlugin: PluginOption = null;
  if (analyze) {
    const reportPath = resolve(cwd, ".alab/report.html");
    const vizOpts = {
      filename: reportPath,
      open: true,
      gzipSize: true,
      brotliSize: true,
      title: "Alab — bundle analysis",
    };
    let loaded = false;
    for (const pkg of ["rolldown-plugin-visualizer", "rollup-plugin-visualizer"]) {
      try {
        const { visualizer } = await import(pkg) as {
          visualizer: (opts: Record<string, unknown>) => PluginOption;
        };
        visualizerPlugin = visualizer(vizOpts);
        console.log(`  alab  bundle report → .alab/report.html  (${pkg})\n`);
        loaded = true;
        break;
      } catch { /* try next */ }
    }
    if (!loaded) {
      console.warn("  alab  warning: install rolldown-plugin-visualizer or rollup-plugin-visualizer to enable --analyze.");
    }
  }

  const tasks: Promise<unknown>[] = [
    viteBuild({
      root: cwd,
      plugins: [
        (await import("alab-vite-plugin")).alabPlugin({ mode: "build" }),
        ...(visualizerPlugin ? [visualizerPlugin] : []),
      ],
      build: {
        outDir: resolve(cwd, ".alab/dist"),
        ssrManifest: true,
      },
    }),
  ];

  if (!skipTypecheck) {
    console.log("  alab  type-checking...");
    tasks.push(runTypecheck(cwd));
  }

  await Promise.all(tasks);

  // Bundle the offline service worker as a separate iife chunk.
  // Output: .alab/dist/client/_alab/offline-sw.js (served at /_alab/offline-sw.js)
  await buildOfflineSw(cwd);

  console.log("\n  alab  build complete → .alab/dist");
}

/** Compile the offline service worker to a standalone iife bundle. */
async function buildOfflineSw(cwd: string): Promise<void> {
  const swEntry = new URL("../client/offline-sw.js", import.meta.url).pathname;
  const outDir = resolve(cwd, ".alab/dist/client/_alab");
  try {
    await viteBuild({
      root: cwd,
      configFile: false,
      build: {
        outDir,
        emptyOutDir: false,
        lib: {
          entry: swEntry,
          name: "AlabOfflineSW",
          formats: ["iife"],
          fileName: () => "offline-sw.js",
        },
        minify: true,
        rolldownOptions: { output: { inlineDynamicImports: true } },
      },
    });
  } catch {
    // Non-fatal: offline SW is a progressive enhancement
    console.warn("  alab  warning: could not build offline service worker");
  }
}
