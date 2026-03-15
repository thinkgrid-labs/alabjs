import type { Plugin } from "vite";
import type { AlabNapi } from "./napi.js";
import { parseErrorLocation, formatBoundaryError } from "./overlay.js";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

interface AlabPluginOptions {
  /** "dev" (default) or "build" */
  mode?: "dev" | "build";
}

const VIRTUAL_CLIENT_ID = "/@alabjs/client";
const VIRTUAL_REFRESH_ID = "/@react-refresh";

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

  const corePlugin: Plugin = {
    name: "alabjs",
    enforce: "pre",

    async buildStart() {
      try {
        // CJS module imported via ESM dynamic import — functions land on .default
        const mod = await import("@alabjs/compiler") as { default?: AlabNapi } & AlabNapi;
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
      return null;
    },

    load(id): string | null {
      if (id === VIRTUAL_REFRESH_ID) {
        // Re-export the react-refresh runtime so the preamble can import it.
        return `export { default } from "react-refresh/runtime";\n`;
      }
      if (id !== VIRTUAL_CLIENT_ID) return null;

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

const meta = (name) => document.querySelector(\`meta[name="\${name}"]\`)?.getAttribute("content") ?? "";

/** Load a page module, its layout modules, and optional loading fallback. */
async function buildApp(routeFile, layoutFiles, loadingFile, params, searchParams) {
  const mod = await import(/* @vite-ignore */ "/" + routeFile);
  const Page = mod.default;
  if (!Page) return null;

  const layoutMods = await Promise.all(layoutFiles.map(f => import(/* @vite-ignore */ "/" + f)));
  const layouts = layoutMods.map(m => m.default).filter(Boolean);

  // Loading fallback: import loading.tsx if present
  let loadingEl = null;
  if (loadingFile) {
    try {
      const lMod = await import(/* @vite-ignore */ "/" + loadingFile);
      const Loading = lMod.default;
      if (Loading) loadingEl = createElement(Loading, {});
    } catch {}
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
const params = JSON.parse(meta("alabjs-params") || "{}");
const searchParams = JSON.parse(meta("alabjs-search-params") || "{}");
const layoutFiles = JSON.parse(meta("alabjs-layouts") || "[]");
const loadingFile = meta("alabjs-loading") || null;

if (routeFile) {
  const app = await buildApp(routeFile, layoutFiles, loadingFile, params, searchParams);
  if (app) {
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

/** SPA navigation — fetch target page and swap React root in-place. */
window.__alabjs_navigate = async (href) => {
  try {
    const res = await fetch(href, { headers: { "x-alabjs-prefetch": "1" } });
    if (!res.ok) { window.location.href = href; return; }
    const html = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const newMeta = (name) => doc.querySelector(\`meta[name="\${name}"]\`)?.getAttribute("content") ?? "";
    const newRouteFile = newMeta("alabjs-route");
    const newParams = JSON.parse(newMeta("alabjs-params") || "{}");
    const newSearchParams = JSON.parse(newMeta("alabjs-search-params") || "{}");
    const newLayoutFiles = JSON.parse(newMeta("alabjs-layouts") || "[]");
    const newLoadingFile = newMeta("alabjs-loading") || null;

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
      return html.replace(/(<head[^>]*>)/i, `$1\n${preambleTag}`);
    },

    async transform(
      code,
      id,
      transformOptions,
    ): Promise<{ code: string; map: string | null } | null> {
      if (!napi) return null;
      if (!/\.(ts|tsx)$/.test(id)) return null;
      if (id.includes("node_modules")) return null;

      const isServerFile = /\.server\.(ts|tsx)$/.test(id);
      const isClientBuild = !(transformOptions as { ssr?: boolean } | undefined)?.ssr;

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
      const minify = options.mode === "build";
      // Emit source maps in dev mode so browser devtools map to original TS/TSX.
      const sourceMap = !minify;
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

      // In dev mode, append the react-refresh HMR accept footer to TSX files.
      // This tells Vite the module self-accepts so hot updates stay component-
      // level instead of propagating to a full page reload.
      // The $RefreshReg$ / $RefreshSig$ calls are already emitted by the Rust
      // compiler (oxc_transformer::enable_all includes the react-refresh pass).
      if (!minify && /\.tsx$/.test(id)) {
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
