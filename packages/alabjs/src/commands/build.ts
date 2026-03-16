import { build as viteBuild, type PluginOption } from "vite";
import { resolve } from "node:path";
import { spawn, execSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { loadUserConfig } from "../config.js";
import type { FederationConfig } from "../config.js";
import { preRenderPPRShell, findBuildLayoutFiles, PPR_CACHE_SUBDIR } from "../ssr/ppr.js";
import type { RouteManifest } from "../router/manifest.js";

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

  // Write a stable build ID for skew protection (must run after Vite so the
  // route-manifest.json is in place for the content-hash fallback path).
  const distDir = resolve(cwd, ".alabjs/dist");
  await writeBuildId(distDir, cwd);
  await buildPPRShells(distDir, cwd);

  // Bundle the offline service worker as a separate iife chunk.
  // Output: .alabjs/dist/client/_alabjs/offline-sw.js (served at /_alabjs/offline-sw.js)
  await buildOfflineSw(cwd);

  // Build federation vendor + exposed modules if configured.
  const userConfig = await loadUserConfig(cwd);
  if (userConfig.federation) {
    await buildFederation(cwd, userConfig.federation);
  }

  console.log("\n  alab  build complete → .alabjs/dist");
}

/**
 * Generate a stable build ID and write it to `.alabjs/dist/BUILD_ID`.
 *
 * Strategy (in priority order):
 *  1. Git short SHA — deterministic, human-readable, zero CPU cost.
 *  2. Rust FNV-1a hash of the route-manifest JSON via `@alabjs/compiler`
 *     (napi binary) — content-addressed, no git required.
 *  3. Base-36 millisecond timestamp — last resort when both git and napi
 *     are unavailable (e.g. first-time contributor without Rust toolchain).
 */
async function writeBuildId(distDir: string, cwd: string): Promise<void> {
  let buildId: string;

  // 1. Git SHA (preferred — zero cost, guaranteed unique per commit)
  try {
    buildId = execSync("git rev-parse --short HEAD", { cwd, encoding: "utf8" }).trim();
  } catch {
    // 2. Rust FNV-1a hash of the route manifest (content-addressed)
    try {
      const manifestPath = resolve(distDir, "route-manifest.json");
      const manifestContent = readFileSync(manifestPath, "utf8");
      type NapiWithHash = { hashBuildId(s: string): string };
      const mod = await import("@alabjs/compiler") as unknown as { default?: NapiWithHash } & NapiWithHash;
      const napi: NapiWithHash = (mod.default ?? mod) as NapiWithHash;
      if (typeof napi.hashBuildId === "function") {
        buildId = napi.hashBuildId(manifestContent);
      } else {
        throw new Error("hashBuildId not available");
      }
    } catch {
      // 3. Timestamp fallback
      buildId = Date.now().toString(36);
    }
  }

  writeFileSync(resolve(distDir, "BUILD_ID"), buildId, "utf8");
  console.log(`  alab  build ID → ${buildId}`);
}

/**
 * Pre-render static HTML shells for every page that exports `ppr = true`.
 *
 * Runs AFTER the Vite SSR bundle so compiled page modules are available in
 * `.alabjs/dist/server/`. Each shell is saved to `.alabjs/ppr-cache/`.
 */
async function buildPPRShells(distDir: string, cwd: string): Promise<void> {
  const manifestPath = resolve(distDir, "route-manifest.json");
  if (!existsSync(manifestPath)) return;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RouteManifest;
  const pageRoutes = manifest.routes.filter((r) => r.kind === "page");
  const pprCacheDir = resolve(cwd, PPR_CACHE_SUBDIR);
  let count = 0;

  for (const route of pageRoutes) {
    const modulePath = resolve(distDir, "server", route.file);
    if (!existsSync(modulePath)) continue;

    // Dynamic import — module is compiled ESM, importable by Node directly.
    const mod = await import(modulePath) as {
      default?: unknown;
      ppr?: unknown;
      metadata?: Record<string, unknown>;
    };

    if (mod.ppr !== true) continue;
    if (typeof mod.default !== "function") {
      console.warn(`  alab  ppr: ${route.file} has no default export — skipping.`);
      continue;
    }

    // Load layout modules (outermost → innermost).
    const layoutPaths = findBuildLayoutFiles(route.file, distDir);
    const layoutMods = await Promise.all(
      layoutPaths.map((p) => import(resolve(distDir, "server", p))),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layouts = layoutMods.map((m: any) => m.default).filter((c: unknown) => typeof c === "function");

    try {
      await preRenderPPRShell({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Page: mod.default as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layouts: layouts as any[],
        shellOpts: {
          metadata: (mod.metadata as never) ?? {},
          paramsJson: "{}",
          searchParamsJson: "{}",
          routeFile: route.file,
          ssr: true,
        },
        pprCacheDir,
        routePath: route.path,
      });
      count++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  alab  ppr: failed to pre-render ${route.path}: ${msg}`);
    }
  }

  if (count > 0) {
    console.log(`  alab  ppr  → ${count} shell${count === 1 ? "" : "s"} written to ${PPR_CACHE_SUBDIR}`);
  }
}

// ─── Federation build ─────────────────────────────────────────────────────────

/**
 * Build all federation artefacts after the main SSR bundle:
 *  1. Vendor ESM chunks for shared React singletons (`/_alabjs/vendor/`)
 *  2. Exposed component modules (`/_alabjs/remotes/<name>/<ExposedName>.js`)
 *  3. `federation-config.json` in the dist root (read by `alab start`)
 *  4. `federation-manifest.json` in the client dir (served at runtime)
 */
async function buildFederation(cwd: string, federation: FederationConfig): Promise<void> {
  const { name, exposes = {}, remotes = {} } = federation;
  const distClientAlab = resolve(cwd, ".alabjs/dist/client/_alabjs");

  const hasExposes = Object.keys(exposes).length > 0;
  const hasRemotes = Object.keys(remotes).length > 0;

  if (hasRemotes || hasExposes) {
    await buildFederationVendors(cwd, distClientAlab, federation.shared ?? []);
  }

  if (hasExposes) {
    await buildFederationExposes(cwd, distClientAlab, name, exposes, federation.shared ?? []);
  }

  // Write federation config for the production server (import map generation).
  writeFileSync(
    resolve(cwd, ".alabjs/dist/federation-config.json"),
    JSON.stringify(federation, null, 2),
    "utf8",
  );

  console.log(
    `  alab  federation → ${Object.keys(exposes).length} exposed, ${Object.keys(remotes).length} remote(s)`,
  );
}

/** Build React + react-dom (and any user `shared` packages) as standalone ESM vendor files. */
async function buildFederationVendors(
  cwd: string,
  distClientAlab: string,
  extraShared: string[] = [],
): Promise<void> {
  const vendorDir = resolve(distClientAlab, "vendor");
  mkdirSync(vendorDir, { recursive: true });

  // Always vendor the React singleton packages.
  const coreVendors: Array<{ specifier: string; output: string }> = [
    { specifier: "react",             output: "react.js" },
    { specifier: "react/jsx-runtime", output: "react-jsx-runtime.js" },
    { specifier: "react-dom",         output: "react-dom.js" },
    { specifier: "react-dom/client",  output: "react-dom-client.js" },
  ];
  // User-declared shared packages (e.g. "date-fns", "zustand").
  const extraVendors: Array<{ specifier: string; output: string }> = extraShared.map((pkg) => ({
    specifier: pkg,
    output: `${pkg.replace(/\//g, "--")}.js`,
  }));
  const vendors = [...coreVendors, ...extraVendors];

  for (const { specifier, output } of vendors) {
    const virtualId = `\0alabjs-vendor:${specifier}`;
    try {
      await viteBuild({
        root: cwd,
        configFile: false,
        plugins: [{
          name: "alabjs-federation-vendor",
          resolveId: (id: string) => id === virtualId ? id : null,
          load: (id: string) =>
            id === virtualId
              ? `export * from "${specifier}"; export { default } from "${specifier}";`
              : null,
        }],
        build: {
          outDir: vendorDir,
          emptyOutDir: false,
          lib: {
            entry: virtualId,
            formats: ["es"],
            fileName: () => output,
          },
          minify: true,
        },
        logLevel: "warn",
      });
    } catch (err) {
      console.warn(`  alab  federation: failed to build vendor ${specifier}: ${String(err)}`);
    }
  }
}

/** Build each exposed module as an externalized ESM chunk for remote consumption. */
async function buildFederationExposes(
  cwd: string,
  distClientAlab: string,
  appName: string,
  exposes: Record<string, string>,
  shared: string[],
): Promise<void> {
  const remotesDir = resolve(distClientAlab, `remotes/${appName}`);
  mkdirSync(remotesDir, { recursive: true });

  const external = [
    "react",
    "react/jsx-runtime",
    "react-dom",
    "react-dom/client",
    ...shared,
  ];

  for (const [exposedName, entryRelPath] of Object.entries(exposes)) {
    const entryAbs = resolve(cwd, entryRelPath.replace(/^\.\//, ""));
    try {
      await viteBuild({
        root: cwd,
        configFile: false,
        build: {
          outDir: remotesDir,
          emptyOutDir: false,
          lib: {
            entry: entryAbs,
            formats: ["es"],
            fileName: () => `${exposedName}.js`,
          },
          minify: true,
          rolldownOptions: { external },
        },
        logLevel: "warn",
      });
    } catch (err) {
      console.warn(`  alab  federation: failed to build exposed "${exposedName}": ${String(err)}`);
    }
  }

  // Manifest consumed by host apps discovering what this remote exposes.
  const manifest = {
    name: appName,
    exposes: Object.fromEntries(
      Object.keys(exposes).map((k) => [k, `/_alabjs/remotes/${appName}/${k}.js`]),
    ),
  };
  writeFileSync(
    resolve(distClientAlab, "federation-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
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
