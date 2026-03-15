import type { Plugin } from "vite";
import type { AlabNapi } from "./napi.js";

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
        napi = (await import("@alab/compiler")) as AlabNapi;
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

    async transform(code, id): Promise<{ code: string; map: string | null } | null> {
      if (!napi) return null;
      if (!/\.(ts|tsx)$/.test(id)) return null;
      if (id.includes("node_modules")) return null;

      // Check server-boundary violations
      const violationsJson = napi.checkBoundary(code, id);
      const violations = JSON.parse(violationsJson) as Array<{
        import: string;
        source: string;
        line: number;
      }>;

      for (const v of violations) {
        this.error(
          `Server boundary violation in ${v.source}:\n` +
            `  Cannot import server module "${v.import}" in a client context.\n` +
            `  Use \`import type\` for type-only references, or move logic to a .server.ts file.`,
        );
      }

      // Compile TypeScript/TSX with the Rust compiler
      const minify = options.mode === "build";
      const outputJson = napi.compileSource(code, id, minify);
      const output = JSON.parse(outputJson) as { code: string; map: string | null };

      return { code: output.code, map: output.map ?? null };
    },
  };

  // Tailwind CSS v4 — zero-config, auto-detects utility classes in source files.
  // Installed by default via `create-alab`; gracefully skipped if absent.
  let tailwindPlugin: Plugin | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tw = require("@tailwindcss/vite") as { default: () => Plugin };
    tailwindPlugin = tw.default();
  } catch {
    // @tailwindcss/vite not installed — skip silently.
  }

  return [corePlugin, ...(tailwindPlugin ? [tailwindPlugin] : [])];
}
