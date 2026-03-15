import type { Plugin } from "vite";
import type { AlabNapi } from "./napi.js";
import { parseErrorLocation, formatBoundaryError } from "./overlay.js";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

interface AlabPluginOptions {
  /** "dev" (default) or "build" */
  mode?: "dev" | "build";
}

const VIRTUAL_CLIENT_ID = "/@alab/client";

/**
 * Alab Vite Plugin
 *
 * - Replaces Vite's default esbuild transform for `.ts` / `.tsx` files with
 *   the Alab Rust compiler (oxc-based).
 * - Enforces server/client boundary violations at transform time.
 * - Serves the virtual `/@alab/client` module that hydrates the page on the
 *   client after SSR (reads route metadata from embedded `<meta>` tags).
 * - Wires in Tailwind CSS v4 via `@tailwindcss/vite` (zero-config, optional).
 */
export function alabPlugin(options: AlabPluginOptions = {}): Plugin[] {
  let napi: AlabNapi | null = null;

  const corePlugin: Plugin = {
    name: "alab",
    enforce: "pre",

    async buildStart() {
      try {
        // CJS module imported via ESM dynamic import — functions land on .default
        const mod = await import("@alab/compiler") as { default?: AlabNapi } & AlabNapi;
        napi = (mod.default ?? mod) as AlabNapi;
      } catch {
        this.warn(
          "alab-napi binary not found — falling back to esbuild. " +
            "Run `cargo build --release -p alab-napi && bash scripts/copy-napi-binary.sh` to compile the Rust core.",
        );
      }
    },

    resolveId(id): string | null {
      if (id === VIRTUAL_CLIENT_ID) return VIRTUAL_CLIENT_ID;
      return null;
    },

    load(id): string | null {
      if (id !== VIRTUAL_CLIENT_ID) return null;

      // This module is injected into every page as `<script type="module" src="/@alab/client">`.
      // It reads the route metadata embedded in <meta> tags by the SSR renderer and
      // hydrates (or mounts) the React page component on the client.
      return `
import "/app/globals.css";
import { createElement, Suspense } from "react";
import { hydrateRoot, createRoot } from "react-dom/client";
import { AlabProvider } from "alab/client";

const meta = (name) => document.querySelector(\`meta[name="\${name}"]\`)?.getAttribute("content") ?? "";

const routeFile = meta("alab-route");
const ssrEnabled = meta("alab-ssr") === "true";
const params = JSON.parse(meta("alab-params") || "{}");
const searchParams = JSON.parse(meta("alab-search-params") || "{}");

if (routeFile) {
  const mod = await import(/* @vite-ignore */ "/" + routeFile);
  const Page = mod.default;
  if (Page) {
    const root = document.getElementById("alab-root");
    if (root) {
      const app = createElement(AlabProvider, null, createElement(Page, { params, searchParams }));
      if (ssrEnabled && root.hasChildNodes()) {
        hydrateRoot(root, app);
      } else {
        createRoot(root).render(app);
      }
    }
  }
}
`.trimStart();
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
        return { code: "// alab: server module stripped from client bundle\n", map: null };
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
      let outputJson: string;
      try {
        outputJson = napi.compileSource(code, id, minify);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const loc = parseErrorLocation(message, id);
        this.error(message, loc ?? undefined);
      }
      const output = JSON.parse(outputJson!) as { code: string; map: string | null };

      return { code: output.code, map: output.map ?? null };
    },
  };

  // Tailwind CSS v4 — zero-config, auto-detects utility classes in source files.
  // Installed by default via `create-alab`; gracefully skipped if absent.
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

  // Stub @alab/compiler in non-SSR (client) builds.
  // generateBlurPlaceholder in Image.tsx has a dynamic import("@alab/compiler")
  // that Vite's import-analysis picks up statically and errors on in the browser
  // bundle. Returning a virtual empty module lets the dynamic import succeed at
  // runtime (it returns {}) while keeping the real binary available on the server.
  const COMPILER_STUB_ID = "\0@alab/compiler-stub";
  const externalsPlugin: Plugin = {
    name: "alab:externals",
    resolveId(id, _importer, opts): string | null {
      if (id === "@alab/compiler" && !(opts as { ssr?: boolean } | undefined)?.ssr) {
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
