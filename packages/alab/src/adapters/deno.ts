/**
 * Alab adapter for Deno Deploy.
 *
 * @example
 * ```ts
 * // main.ts (entry point for `deployctl deploy`)
 * import { createDenoHandler } from "alab/adapters/deno";
 * import manifest from "./.alab/manifest.json" with { type: "json" };
 * import * as pages from "./.alab/pages";
 *
 * const handler = createDenoHandler(manifest, pages);
 * Deno.serve(handler.fetch.bind(handler));
 * ```
 *
 * **Notes:**
 * - Image optimisation (`/_alab/image`) is not available on Deno Deploy;
 *   requests are redirected to the original source URL.
 * - Uses the same Web Fetch API handler as the Cloudflare adapter.
 */
export { createFetchHandler as createDenoHandler } from "./web.js";
export type { PageModule } from "./web.js";
