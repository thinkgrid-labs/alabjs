import { build as viteBuild, type PluginOption } from "vite";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

interface BuildOptions {
  cwd: string;
  /** Skip TypeScript type checking (--skip-typecheck flag). */
  skipTypecheck?: boolean;
  /**
   * Build mode:
   * - `"ssr"` (default) — full SSR + client bundle, requires a Node.js server.
   * - `"spa"` — pure client-side bundle, deployable to any CDN. No Node.js needed.
   *   Server functions become direct fetch calls to `/_alabjs/fn/*`; point these at
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
      else fail(new Error(`[alabjs] TypeScript type errors found (tsc --noEmit exited ${code})`));
    });
    child.on("error", fail);
  });
}

/**
 * SPA mode: emit a single index.html shell + hashed client assets.
 * No SSR build step — React hydrates from scratch on the client.
 */
async function buildSpa(cwd: string): Promise<void> {
  const outDir = resolve(cwd, ".alabjs/dist/spa");

  // Emit a minimal index.html if the project doesn't have one.
  // We do this BEFORE calling viteBuild so Vite can resolve it as an entry point.
  const indexPath = resolve(cwd, "index.html");
  let temporaryIndex = false;

  if (!existsSync(indexPath)) {
    temporaryIndex = true;
    const spa = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/app/globals.css" />
  </head>
  <body>
    <div id="alabjs-root"></div>
    <script type="module" src="/@alabjs/client"></script>
  </body>
</html>`;
    writeFileSync(indexPath, spa, "utf8");
  }

  try {
    await viteBuild({
      root: cwd,
      plugins: [(await import("alabjs-vite-plugin")).alabPlugin({ mode: "build" })],
      build: {
        outDir,
        // Client-only — no SSR entry, no server manifest needed.
        ssrManifest: false,
        rolldownOptions: {
          input: indexPath,
        },
      },
    });
  } finally {
    // If we created a temporary index.html, remove it after the build.
    if (temporaryIndex) {
      const { rmSync } = await import("node:fs");
      rmSync(indexPath, { force: true });
    }
  }

  console.log("\n  alab  SPA build complete → .alabjs/dist/spa");
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
    const reportPath = resolve(cwd, ".alabjs/report.html");
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
        console.log(`  alab  bundle report → .alabjs/report.html  (${pkg})\n`);
        loaded = true;
        break;
      } catch (err) {
        const msg = String(err);
        // Only silently skip "module not found"; anything else is unexpected.
        if (!msg.includes("Cannot find module") && !msg.includes("ERR_MODULE_NOT_FOUND")) {
          console.warn(`  alab  warning: failed to load visualizer (${pkg}): ${msg}`);
        }
      }
    }
    if (!loaded) {
      console.warn("  alab  warning: install rolldown-plugin-visualizer or rollup-plugin-visualizer to enable --analyze.");
    }
  }

  const tasks: Promise<unknown>[] = [
    viteBuild({
      root: cwd,
      plugins: [
        (await import("alabjs-vite-plugin")).alabPlugin({ mode: "build" }),
        ...(visualizerPlugin ? [visualizerPlugin] : []),
      ],
      build: {
        outDir: resolve(cwd, ".alabjs/dist"),
        ssrManifest: true,
        rolldownOptions: {
          // In SSR mode, we don't use an index.html as the entry point.
          // Instead, we bundle the virtual client module as the main browser asset.
          input: "/@alabjs/client",
        },
      },
    }),
  ];

  if (!skipTypecheck) {
    console.log("  alab  type-checking...");
    tasks.push(runTypecheck(cwd));
  }

  await Promise.all(tasks);

  // Bundle the offline service worker as a separate iife chunk.
  // Output: .alabjs/dist/client/_alabjs/offline-sw.js (served at /_alabjs/offline-sw.js)
  await buildOfflineSw(cwd);

  console.log("\n  alab  build complete → .alabjs/dist");
}

/** Compile the offline service worker to a standalone iife bundle. */
async function buildOfflineSw(cwd: string): Promise<void> {
  const swEntry = new URL("../client/offline-sw.js", import.meta.url).pathname;
  const outDir = resolve(cwd, ".alabjs/dist/client/_alabjs");
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
  } catch (err) {
    // Non-fatal: offline SW is a progressive enhancement
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  alab  warning: could not build offline service worker: ${msg}`);
  }
}
