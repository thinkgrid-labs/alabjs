import type { Plugin } from "vite";

interface AlabPluginOptions {
  /** "dev" (default) or "build" */
  mode?: "dev" | "build";
}

/**
 * Alab Vite Plugin
 *
 * Replaces Vite's default esbuild transform for `.ts` / `.tsx` files with
 * the Alab Rust compiler (oxc-based). This gives you:
 * - 50-100x faster linting
 * - Server-boundary violation detection at transform time
 * - Consistent compile output between dev and production builds
 */
export function alabPlugin(options: AlabPluginOptions = {}): Plugin {
  let napi: typeof import("alab-napi") | null = null;

  return {
    name: "alab",
    enforce: "pre",

    async buildStart() {
      try {
        napi = await import("alab-napi");
      } catch {
        this.warn(
          "alab-napi binary not found — falling back to esbuild. " +
            "Run `pnpm --filter alab-napi build` to compile the Rust core.",
        );
      }
    },

    async transform(code, id) {
      if (!napi) return null;
      if (!/\.(ts|tsx|js|jsx)$/.test(id)) return null;
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
            `  Move the import to a .server.ts file or use \`useServerData()\` instead.`,
        );
      }

      // Compile with Rust
      const outputJson = napi.compileSource(code, id, false);
      const output = JSON.parse(outputJson) as { code: string; map: string | null };

      return {
        code: output.code,
        map: output.map ?? null,
      };
    },
  };
}
