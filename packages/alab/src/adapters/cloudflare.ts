/**
 * Alab adapter for Cloudflare Workers.
 *
 * @example
 * ```ts
 * // src/worker.ts (entry point for `wrangler deploy`)
 * import { createCloudflareHandler } from "alab/adapters/cloudflare";
 * import manifest from "../.alab/manifest.json" assert { type: "json" };
 * import * as pages from "../.alab/pages";
 *
 * export default createCloudflareHandler(manifest, pages);
 * ```
 *
 * **wrangler.toml**
 * ```toml
 * name = "my-alab-app"
 * main = "src/worker.ts"
 * compatibility_date = "2024-01-01"
 *
 * [site]
 * bucket = ".alab/dist/client"
 * ```
 *
 * **Notes:**
 * - Image optimisation (`/_alab/image`) is not available on Workers;
 *   requests are redirected to the original source URL.
 * - Static assets are served by Cloudflare's edge via the `[site]` binding.
 */
export { createFetchHandler as createCloudflareHandler } from "./web.js";
export type { PageModule } from "./web.js";
