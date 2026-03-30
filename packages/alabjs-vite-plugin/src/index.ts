import type { Plugin } from "vite";
import type { AlabNapi } from "./napi.js";
import { parseErrorLocation, formatBoundaryError } from "./overlay.js";
import { devToolbarScript } from "./devtools.js";
import { generateLiveComponentStub, generateLiveClientRuntime, generateLiveServerWrapper } from "./live-stub.js";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname } from "node:path";

interface AlabPluginOptions {
  /** "dev" (default) or "build" */
  mode?: "dev" | "build";
}

const VIRTUAL_CLIENT_ID = "/@alabjs/client";
const VIRTUAL_REFRESH_ID = "/@react-refresh";
const VIRTUAL_LIVE_CLIENT_ID = "/@alabjs/live-client";
// In production builds the Rust compiler still emits jsxDEV calls (from
// react/jsx-dev-runtime), but React's production bundle exports jsxDEV=void 0.
// This virtual shim re-exports the production jsx/jsxs functions under the
// dev names so production builds work without changing the Rust compiler.
const VIRTUAL_JSX_DEV_SHIM_ID = "\0@alabjs/jsx-dev-shim";

// Resolve react-refresh from the plugin's own node_modules so consumers
// don't need to install it. We alias the package root (not runtime directly)
// so Vite's dep optimizer can pre-bundle it as proper ESM.
const _require = createRequire(import.meta.url);
const REACT_REFRESH_PKG_DIR = dirname(_require.resolve("react-refresh/package.json"));

/**
 * Preamble injected into every HTML page in dev mode.
 * Sets up the global $RefreshReg$ / $RefreshSig$ hooks that the Rust
 * compiler (oxc_transformer enable_all) writes calls to in every TSX file.
 */
const REACT_REFRESH_PREAMBLE = `
import RefreshRuntime from "${VIRTUAL_REFRESH_ID}";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
`.trimStart();

/**
 * Alab Vite Plugin
 *
 * - Replaces Vite's default esbuild transform for `.ts` / `.tsx` files with
 *   the Alab Rust compiler (oxc-based).
 * - Enforces server/client boundary violations at transform time.
 * - Serves the virtual `/@alabjs/client` module that hydrates the page on the
 *   client after SSR (reads route metadata from embedded `<meta>` tags).
 * - Wires in Tailwind CSS v4 via `@tailwindcss/vite` (zero-config, optional).
 */
export function alabPlugin(options: AlabPluginOptions = {}): Plugin[] {
  let napi: AlabNapi | null = null;
  // true when running `vite serve` (dev), false during `vite build` (production).
  let isDev = true;

  const corePlugin: Plugin = {
    name: "alabjs",
    enforce: "pre",

    configResolved(config) {
      isDev = config.command === "serve";
    },

    config(_cfg, env) {
      return {
        // ALAB_PUBLIC_* vars are inlined into the client bundle via import.meta.env.
        // VITE_* is kept for backwards-compatibility with vanilla Vite projects.
        // Everything else (ALAB_REVALIDATE_SECRET, ALAB_CDN, etc.) stays server-only.
        envPrefix: ["VITE_", "ALAB_PUBLIC_"],
        // Alias react-refresh to the plugin's own copy so consumers don't need
        // to install it. optimizeDeps.include ensures Vite pre-bundles it as
        // proper ESM (CJS→ESM interop), giving us a valid `default` export.
        resolve: {
          alias: {
            "react-refresh": REACT_REFRESH_PKG_DIR,
            // In production the Rust compiler still emits jsxDEV calls but React's
            // production bundle exports jsxDEV=void 0. Map the import to a virtual
            // shim that re-exports the production jsx/jsxs functions under the dev names.
            ...(env.command === "build"
              ? { "react/jsx-dev-runtime": VIRTUAL_JSX_DEV_SHIM_ID }
              : {}),
          },
        },
        optimizeDeps: {
          include: ["react-refresh"],
        },
      };
    },

    async buildStart() {
      try {
        // CJS module imported via ESM dynamic import — functions land on .default
        const mod = await import("@alabjs/compiler") as unknown as { default?: AlabNapi } & AlabNapi;
        napi = (mod.default ?? mod) as AlabNapi;
      } catch {
        this.warn(
          "alabjs-napi binary not found — falling back to esbuild. " +
            "Run `cargo build --release -p alab-napi && bash scripts/copy-napi-binary.sh` to compile the Rust core.",
        );
      }
    },

    resolveId(id): string | null {
      if (id === VIRTUAL_CLIENT_ID) return VIRTUAL_CLIENT_ID;
      if (id === VIRTUAL_REFRESH_ID) return VIRTUAL_REFRESH_ID;
      if (id === VIRTUAL_LIVE_CLIENT_ID) return VIRTUAL_LIVE_CLIENT_ID;
      if (id === VIRTUAL_JSX_DEV_SHIM_ID) return VIRTUAL_JSX_DEV_SHIM_ID;
      // ?live-actual: used by the server-build live wrapper to import the real
      // component without triggering another live transform (avoids infinite loop).
      if (id.endsWith("?live-actual")) return id;
      return null;
    },

    async load(id): Promise<string | null> {
      if (id === VIRTUAL_LIVE_CLIENT_ID) {
        return generateLiveClientRuntime();
      }
      if (id.endsWith("?live-actual")) {
        // Load the raw TypeScript source for the real live component.
        // Vite's default transformer (esbuild) will compile it after this load hook.
        const realPath = id.slice(0, -"?live-actual".length);
        const { readFileSync } = await import("node:fs");
        return readFileSync(realPath, "utf-8");
      }
      if (id === VIRTUAL_REFRESH_ID) {
        // Re-export the react-refresh runtime so the preamble can import it.
        // Use bare specifier so Vite's dep optimizer (pre-bundler) handles the
        // CJS→ESM conversion. The resolve.alias above points react-refresh to
        // the plugin's own copy, so consumers don't need it installed.
        return `export { default } from "react-refresh/runtime";\n`;
      }
      if (id === VIRTUAL_JSX_DEV_SHIM_ID) {
        // Production shim: the Rust compiler always emits jsxDEV/jsxsDEV calls
        // (oxc_transformer uses the dev JSX transform). React's production build
        // exports jsxDEV=void 0 from react/jsx-dev-runtime, causing a runtime error.
        // Re-export the production jsx/jsxs functions under the dev names so
        // production bundles render correctly.
        return `export { jsx as jsxDEV, jsxs as jsxsDEV, Fragment } from "react/jsx-runtime";\n`;
      }
      if (id !== VIRTUAL_CLIENT_ID) return null;

      // Scan app/ for page, layout, and loading files.
      // We generate statically-analyzable import() calls (no @vite-ignore) so
      // Rolldown can create proper code-split chunks at build time and the
      // browser can fetch them in production.
      const cwd = process.cwd();
      const appDir = cwd + "/app";
      const { readdirSync } = await import("node:fs");
      const { join: pathJoin } = await import("node:path");

      function scanFiles(dir: string, names: string[], base: string): string[] {
        const results: string[] = [];
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return results; }
        for (const entry of entries) {
          const full = pathJoin(dir, entry.name);
          if (entry.isDirectory()) {
            results.push(...scanFiles(full, names, base));
          } else if (names.includes(entry.name)) {
            results.push(full.slice(base.length + 1).replace(/\\/g, "/"));
          }
        }
        return results;
      }

      const PAGE_NAMES = ["page.tsx", "page.ts", "page.jsx", "page.js"];
      const LAYOUT_NAMES = ["layout.tsx", "layout.ts", "layout.jsx", "layout.js"];
      const LOADING_NAMES = ["loading.tsx", "loading.ts", "loading.jsx", "loading.js"];

      const pageFiles = scanFiles(appDir, PAGE_NAMES, cwd);
      const layoutFiles = scanFiles(appDir, LAYOUT_NAMES, cwd);
      const loadingFiles = scanFiles(appDir, LOADING_NAMES, cwd);

      function makeEntry(f: string): string {
        // Static import() — Rolldown analyzes these and creates code-split chunks.
        return `  ${JSON.stringify(f)}: () => import(${JSON.stringify("/" + f)})`;
      }

      const pagesMap = pageFiles.map(makeEntry).join(",\n");
      const layoutsMap = layoutFiles.map(makeEntry).join(",\n");
      const loadingMap = loadingFiles.map(makeEntry).join(",\n");

      // This module is injected into every page as `<script type="module" src="/@alabjs/client">`.
      // It reads the route metadata embedded in <meta> tags by the SSR renderer and
      // hydrates (or mounts) the React page component on the client.
      // It also sets up window.__alabjs_navigate for the <Link> component.
      return `
import "/app/globals.css";
import { createElement, Suspense } from "react";
import { hydrateRoot, createRoot } from "react-dom/client";
import { AlabProvider } from "alabjs/client";
import { ErrorBoundary } from "alabjs/components";

// Statically-analyzable import maps — Rolldown creates code-split chunks from these.
// Keys are cwd-relative source paths matching the alabjs-route / alabjs-layouts meta values.
const PAGES = {
${pagesMap}
};
const LAYOUT_MODS = {
${layoutsMap}
};
const LOADING_MODS = {
${loadingMap}
};

const meta = (name) => document.querySelector(\`meta[name="\${name}"]\`)?.getAttribute("content") ?? "";

/** Load a page module, its layout modules, and optional loading fallback. */
async function buildApp(routeFile, layoutFiles, loadingFile, params, searchParams) {
  // Normalize .js extension to .tsx for lookups (server meta may store compiled paths).
  const norm = (p) => LAYOUT_MODS[p] ? p : p.replace(/\\.js$/, ".tsx");

  const pageFn = PAGES[routeFile];
  if (!pageFn) return null;
  const mod = await pageFn();
  const Page = mod.default;
  if (!Page) return null;

  const layoutMods = await Promise.all(
    layoutFiles.map(f => { const fn = LAYOUT_MODS[norm(f)]; return fn ? fn() : Promise.resolve({}); })
  );
  const layouts = layoutMods.map(m => m.default).filter(Boolean);

  // Loading fallback: import loading.tsx if present
  let loadingEl = null;
  if (loadingFile) {
    const lFn = LOADING_MODS[norm(loadingFile)];
    if (lFn) {
      try {
        const lMod = await lFn();
        const Loading = lMod.default;
        if (Loading) loadingEl = createElement(Loading, {});
      } catch {}
    }
  }

  let el = createElement(Page, { params, searchParams });
  // Wrap in Suspense with loading fallback
  el = createElement(Suspense, { fallback: loadingEl ?? createElement("div", {}) }, el);
  for (let i = layouts.length - 1; i >= 0; i--) {
    el = createElement(layouts[i], {}, el);
  }
  return createElement(ErrorBoundary, {}, createElement(AlabProvider, {}, el));
}

let alabRoot = null;

const routeFile = meta("alabjs-route");
const ssrEnabled = meta("alabjs-ssr") === "true";
const isFullDocument = meta("alabjs-full-document") === "true";
const params = JSON.parse(meta("alabjs-params") || "{}");
const searchParams = JSON.parse(meta("alabjs-search-params") || "{}");
const layoutFiles = JSON.parse(meta("alabjs-layouts") || "[]");
const loadingFile = meta("alabjs-loading") || null;
// Capture the build ID stamped into this page at render time.
// Used by __alabjs_navigate to detect a deployment change mid-session.
const currentBuildId = meta("alabjs-build-id");

if (routeFile) {
  const app = await buildApp(routeFile, layoutFiles, loadingFile, params, searchParams);
  if (app) {
    if (isFullDocument) {
      // Layout returns <html> — mount on document itself, no shell div needed.
      alabRoot = hydrateRoot(document, app);
    } else {
      const root = document.getElementById("alabjs-root");
      if (root) {
        if (ssrEnabled && root.hasChildNodes()) {
          alabRoot = hydrateRoot(root, app);
        } else {
          alabRoot = createRoot(root);
          alabRoot.render(app);
        }
      }
    }
  }
}

/** SPA navigation — fetch target page and swap React root in-place. */
window.__alabjs_navigate = async (href) => {
  try {
    // Send our build ID so the server can set x-alab-revalidate: 1 if it has
    // been redeployed since this page was loaded.
    const fetchHeaders = { "x-alabjs-prefetch": "1" };
    if (currentBuildId) fetchHeaders["x-alab-build-id"] = currentBuildId;

    const res = await fetch(href, { headers: fetchHeaders });
    if (!res.ok) { window.location.href = href; return; }

    // Server-side skew signal: the server is running a different build.
    // Hard-reload so the browser fetches fresh JS chunks instead of reusing
    // the stale bundle already in memory.
    if (res.headers.get("x-alab-revalidate") === "1") {
      window.location.href = href;
      return;
    }

    const html = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const newMeta = (name) => doc.querySelector(\`meta[name="\${name}"]\`)?.getAttribute("content") ?? "";
    const newRouteFile = newMeta("alabjs-route");
    const newParams = JSON.parse(newMeta("alabjs-params") || "{}");
    const newSearchParams = JSON.parse(newMeta("alabjs-search-params") || "{}");
    const newLayoutFiles = JSON.parse(newMeta("alabjs-layouts") || "[]");
    const newLoadingFile = newMeta("alabjs-loading") || null;

    // Client-side skew signal: the fetched page embeds a different build ID.
    // This catches cases where the response came from a CDN/cache that strips
    // custom headers but still serves fresh HTML.
    const newBuildId = newMeta("alabjs-build-id");
    if (currentBuildId && newBuildId && newBuildId !== currentBuildId) {
      window.location.href = href;
      return;
    }

    // Update document title
    const newTitle = doc.querySelector("title")?.textContent;
    if (newTitle) document.title = newTitle;

    history.pushState({}, "", href);

    if (newRouteFile && alabRoot) {
      const app = await buildApp(newRouteFile, newLayoutFiles, newLoadingFile, newParams, newSearchParams);
      if (app) alabRoot.render(app);
    }

    // Scroll to top on navigation (matches browser behaviour)
    window.scrollTo(0, 0);
  } catch {
    // Network error — fall back to full navigation
    window.location.href = href;
  }
};

// Handle browser back / forward
window.addEventListener("popstate", () => {
  window.__alabjs_navigate(location.pathname + location.search);
});

// ─── Dev boundary overlay (Alt+Shift+B to toggle) ─────────────────────────
if (import.meta.env.DEV) {
  let overlayActive = false;
  let panel = null;
  let rootOutline = null;

  const toggle = () => {
    overlayActive = !overlayActive;

    if (!overlayActive) {
      panel?.remove(); panel = null;
      rootOutline?.remove(); rootOutline = null;
      return;
    }

    // ── Root highlight ──────────────────────────────────────────────────────
    const root = document.getElementById("alabjs-root");
    if (root) {
      rootOutline = document.createElement("div");
      Object.assign(rootOutline.style, {
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 99998,
        outline: "2px solid rgba(99,102,241,0.6)", outlineOffset: "-2px",
      });
      document.body.appendChild(rootOutline);
    }

    // ── Info panel ──────────────────────────────────────────────────────────
    const ssr = meta("alabjs-ssr") === "true";
    const route = meta("alabjs-route");
    const layouts = JSON.parse(meta("alabjs-layouts") || "[]");
    const loading = meta("alabjs-loading");
    const cache = document.querySelector("meta[name='alabjs-cache']")?.getAttribute("content") ?? null;

    panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "fixed", bottom: "12px", left: "12px", zIndex: 99999,
      background: "rgba(15,15,20,0.92)", backdropFilter: "blur(8px)",
      border: "1px solid rgba(99,102,241,0.5)", borderRadius: "8px",
      padding: "10px 14px", color: "#e2e8f0", fontFamily: "monospace",
      fontSize: "11px", lineHeight: "1.6", maxWidth: "340px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    });

    const badge = (label, color) =>
      \`<span style="background:\${color};color:#fff;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">\${label}</span>\`;

    const layoutRows = layouts.map(l =>
      \`<div style="color:#94a3b8;padding-left:8px">↳ \${l}</div>\`
    ).join("");

    panel.innerHTML = [
      \`<div style="margin-bottom:6px;display:flex;align-items:center;gap:6px">\`,
      \`  \${badge(ssr ? "SSR" : "CSR", ssr ? "#6366f1" : "#f59e0b")}\`,
      cache ? \`  \${badge("ISR " + cache, "#10b981")}\` : "",
      \`  <span style="color:#64748b;font-size:10px">Alt+Shift+B to close</span>\`,
      \`</div>\`,
      \`<div><span style="color:#64748b">route  </span>\${route || "—"}</div>\`,
      layouts.length ? \`<div style="color:#64748b">layouts</div>\${layoutRows}\` : "",
      loading ? \`<div><span style="color:#64748b">loading</span> \${loading}</div>\` : "",
    ].join("\\n");

    document.body.appendChild(panel);
  };

  window.addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && e.key === "B") toggle();
  });
}
`.trimStart();
    },

    transformIndexHtml(html, ctx) {
      // Inject the react-refresh preamble only in dev (SSR has no window).
      if (ctx.server == null) return html; // production build — skip
      const preambleTag = `<script type="module">\n${REACT_REFRESH_PREAMBLE}</script>`;
      const withPreamble = html.replace(/(<head[^>]*>)/i, `$1\n${preambleTag}`);
      // Inject the dev toolbar before </body> so it has access to meta tags.
      return withPreamble.replace(/<\/body>/i, `${devToolbarScript()}\n</body>`);
    },

    async transform(
      code,
      id,
      transformOptions,
    ): Promise<{ code: string; map: string | null } | null> {
      if (!napi) return null;
      if (!/\.(ts|tsx)$/.test(id)) return null;
      if (id.includes("node_modules")) return null;
      // ?live-actual IDs are loaded by generateLiveServerWrapper imports; let
      // esbuild compile them normally without triggering another live transform.
      if (id.includes("?live-actual")) return null;

      const isServerFile = /\.server\.(ts|tsx)$/.test(id);
      const isClientBuild = !(transformOptions as { ssr?: boolean } | undefined)?.ssr;

      // ── Live component detection ─────────────────────────────────────────
      // A file is a live component when it uses the *.live.tsx convention OR
      // has a "use live" directive as its first statement.
      const isLiveByConvention = /\.live\.(ts|tsx)$/.test(id);
      let isLiveByDirective = false;
      if (!isLiveByConvention && napi) {
        const directiveJson = napi.detectDirective(code, id);
        const directive = JSON.parse(directiveJson) as { kind: string };
        isLiveByDirective = directive.kind === "use_live";
      }
      const isLiveFile = isLiveByConvention || isLiveByDirective;

      if (isLiveFile) {
        // Derive a stable 16-char ID from the module path (reuses existing FNV-1a hash).
        const moduleId = napi ? napi.hashBuildId(id) : id.replace(/[^a-z0-9]/gi, "_");
        if (isClientBuild) {
          // Client build: replace with LiveMount stub — server code never ships to browser.
          return { code: generateLiveComponentStub(moduleId, ["default"]), map: null };
        } else {
          // Server build: wrap default export in a data-live-id div so SSR pages emit
          // the same DOM structure as LiveMount, enabling React hydration without errors.
          // The ?live-actual import loads the real component without re-triggering this path.
          return { code: generateLiveServerWrapper(moduleId, id + "?live-actual"), map: null };
        }
      }

      // Skip Rust compiler for SSR transforms — the Rust compiler injects React
      // Fast Refresh globals ($RefreshReg$) that don't exist in the SSR context.
      // esbuild (Vite's default) handles SSR compilation correctly.
      if (!isClientBuild) return null;

      // Server files in a CLIENT build context: extract defineServerFn declarations
      // and replace the entire module with fetch stubs so server code never ships
      // to the browser (DB calls, secrets, heavy deps, etc.).
      if (isServerFile && isClientBuild) {
        const serverFnsJson = napi.extractServerFns(code, id);
        const serverFns = JSON.parse(serverFnsJson) as Array<{
          name: string;
          endpoint: string;
        }>;
        if (serverFns.length > 0) {
          const stubs = serverFns
            .map((fn) => napi!.serverFnStub(fn.name, fn.endpoint))
            .join("\n");
          return { code: stubs, map: null };
        }
        // No defineServerFn exports found — emit an empty module so imports don't break.
        return { code: "// alabjs: server module stripped from client bundle\n", map: null };
      }

      // Check server-boundary violations in non-server files.
      if (!isServerFile) {
        const violationsJson = napi.checkBoundary(code, id);
        const violations = JSON.parse(violationsJson) as Array<{
          import: string;
          source: string;
          offset: number;
        }>;
        for (const v of violations) {
          this.error(formatBoundaryError(v));
        }
      }

      // Compile TypeScript/TSX with the Rust compiler.
      // Catch errors and attach source location so Vite's overlay shows
      // the exact line/column instead of a raw stack trace.
      const minify = !isDev;
      // Emit source maps in dev mode so browser devtools map to original TS/TSX.
      const sourceMap = isDev;
      let outputJson: string;
      try {
        outputJson = napi.compileSource(code, id, minify, sourceMap);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const loc = parseErrorLocation(message, id);
        this.error(message, loc ?? undefined);
      }
      const output = JSON.parse(outputJson!) as { code: string; map: string | null };

      let finalCode = output.code;

      if (isDev && /\.tsx$/.test(id)) {
        // In dev mode, append the react-refresh HMR accept footer to TSX files.
        // This tells Vite the module self-accepts so hot updates stay component-
        // level instead of propagating to a full page reload.
        // The $RefreshReg$ / $RefreshSig$ calls are already emitted by the Rust
        // compiler (oxc_transformer::enable_all includes the react-refresh pass).
        finalCode +=
          `\nimport __RefreshRuntime__ from "${VIRTUAL_REFRESH_ID}";` +
          `\nif (import.meta.hot) {` +
          `\n  import.meta.hot.accept();` +
          `\n  __RefreshRuntime__.performReactRefresh();` +
          `\n}`;
      }

      return { code: finalCode, map: output.map ?? null };
    },
  };

  // Tailwind CSS v4 — zero-config, auto-detects utility classes in source files.
  // Installed by default via `create-alabjs`; gracefully skipped if absent.
  // Use createRequire from the project root (process.cwd()) so that the package
  // is found in the user's node_modules, not the plugin's node_modules.
  let tailwindPlugin: Plugin | null = null;
  try {
    const req = createRequire(pathToFileURL(process.cwd() + "/package.json").href);
    const tw = req("@tailwindcss/vite") as { default: () => Plugin };
    tailwindPlugin = tw.default();
  } catch {
    // @tailwindcss/vite not installed — skip silently.
  }

  // Stub @alabjs/compiler in non-SSR (client) builds.
  // generateBlurPlaceholder in Image.tsx has a dynamic import("@alabjs/compiler")
  // that Vite's import-analysis picks up statically and errors on in the browser
  // bundle. Returning a virtual empty module lets the dynamic import succeed at
  // runtime (it returns {}) while keeping the real binary available on the server.
  const COMPILER_STUB_ID = "\0@alabjs/compiler-stub";
  const externalsPlugin: Plugin = {
    name: "alabjs:externals",
    resolveId(id, _importer, opts): string | null {
      if (id === "@alabjs/compiler" && !(opts as { ssr?: boolean } | undefined)?.ssr) {
        return COMPILER_STUB_ID;
      }
      return null;
    },
    load(id): string | null {
      if (id === COMPILER_STUB_ID) {
        return "export default {};\n";
      }
      return null;
    },
  };

  return [externalsPlugin, corePlugin, ...(tailwindPlugin ? [tailwindPlugin] : [])];
}
