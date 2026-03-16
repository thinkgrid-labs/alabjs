import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { ConfigEnv } from "vite";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FederationConfig {
  /**
   * This application's name — used as the namespace for its exposed modules.
   * Other apps reference exposed components as `<name>/<ExposedName>`.
   *
   * @example "marketing"  // exposed modules served at /_alabjs/remotes/marketing/
   */
  name: string;

  /**
   * Modules this app exposes to remote hosts.
   *
   * Key: public component name (e.g. `"Button"`).
   * Value: module path relative to the project root (e.g. `"./app/components/Button"`).
   *
   * Each entry is built as a self-contained ESM chunk served at
   * `/_alabjs/remotes/<name>/<key>.js`.
   */
  exposes?: Record<string, string>;

  /**
   * Remote apps this app consumes.
   *
   * Key: remote app name (matches the remote's `federation.name`).
   * Value: base URL where the remote app is hosted.
   *
   * AlabJS injects a `<script type="importmap">` into every page so that
   * `import("RemoteName/ComponentName")` resolves to the remote's pre-built
   * ESM chunk without any bundler runtime.
   *
   * @example { "RemoteApp": "https://remote.example.com" }
   */
  remotes?: Record<string, string>;

  /**
   * Extra bare-specifier packages to externalize from exposed modules and
   * provide as shared singletons via the import map.
   *
   * `react`, `react/jsx-runtime`, `react-dom`, and `react-dom/client` are
   * always shared automatically — you do not need to list them.
   */
  shared?: string[];
}

export interface AlabConfig {
  federation?: FederationConfig;
}

// ─── defineConfig ─────────────────────────────────────────────────────────────

/** Define your AlabJS configuration with full TypeScript type inference. */
export function defineConfig(config: AlabConfig): AlabConfig {
  return config;
}

// ─── loadUserConfig ───────────────────────────────────────────────────────────

/**
 * Load `alabjs.config.ts` (or `.js` / `.mjs`) from the given project root.
 * Uses Vite's `loadConfigFromFile` so TypeScript configs are supported with
 * zero extra dependencies. Returns `{}` if no config file is found.
 */
export async function loadUserConfig(cwd: string): Promise<AlabConfig> {
  const candidates = [
    "alabjs.config.ts",
    "alabjs.config.js",
    "alabjs.config.mjs",
  ];

  for (const name of candidates) {
    const configPath = resolve(cwd, name);
    if (!existsSync(configPath)) continue;

    try {
      const { loadConfigFromFile } = await import("vite");
      const env: ConfigEnv = { command: "build", mode: "production" };
      const result = await loadConfigFromFile(env, configPath, cwd);
      return (result?.config as AlabConfig | undefined) ?? {};
    } catch (err) {
      console.warn(
        `[alabjs] warning: failed to load ${name}: ${String(err)}`,
      );
    }
    break; // only try the first match
  }

  return {};
}

// ─── buildImportMap ───────────────────────────────────────────────────────────

/**
 * Generate the `<script type="importmap">` JSON for a federation config.
 *
 * - **Production** (`dev = false`): React singleton is served from the host
 *   app's own `/_alabjs/vendor/*.js` files (built by `alab build`).
 *   This guarantees a single React instance across host and all remotes.
 *
 * - **Dev** (`dev = true`): Only remote scope mappings are emitted.
 *   React is already provided by Vite's module graph — injecting a duplicate
 *   entry would create a second instance and break hooks.
 *
 * Returns `null` when the config has no remotes (no import map needed).
 */
export function buildImportMap(
  federation: FederationConfig,
  dev = false,
): string | null {
  const { remotes = {}, shared = [] } = federation;

  if (Object.keys(remotes).length === 0 && !dev) return null;
  if (Object.keys(remotes).length === 0) return null;

  const imports: Record<string, string> = {};

  // Trailing-slash scope: `RemoteApp/Button` → `https://remote.example.com/_alabjs/remotes/RemoteApp/Button.js`
  for (const [remoteName, baseUrl] of Object.entries(remotes)) {
    imports[`${remoteName}/`] = `${baseUrl.replace(/\/$/, "")}/_alabjs/remotes/${remoteName}/`;
  }

  if (!dev) {
    // Production: shared React singleton from locally-built vendor files.
    imports["react"] = "/_alabjs/vendor/react.js";
    imports["react/jsx-runtime"] = "/_alabjs/vendor/react-jsx-runtime.js";
    imports["react-dom"] = "/_alabjs/vendor/react-dom.js";
    imports["react-dom/client"] = "/_alabjs/vendor/react-dom-client.js";

    // Extra shared packages declared by the user
    for (const pkg of shared) {
      if (!imports[pkg]) {
        imports[pkg] = `/_alabjs/vendor/${pkg.replace(/\//g, "--")}.js`;
      }
    }
  }

  return JSON.stringify({ imports });
}
