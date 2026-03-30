/**
 * On-demand ISR revalidation handler.
 *
 * Exposes `POST /_alabjs/revalidate` so CMS webhooks, deploy scripts, or
 * API routes can purge the page HTML and/or server-function data cache
 * without restarting the server.
 *
 * Authentication
 * --------------
 * Set `ALAB_REVALIDATE_SECRET` in your environment. Every request must then
 * include `Authorization: Bearer <secret>`. If the env var is not set the
 * endpoint is open — useful in development, unsafe in production.
 *
 * Request body (JSON) — supply one or more fields:
 * ```json
 * { "path": "/posts/1" }            // purge a single page
 * { "prefix": "/posts" }            // purge /posts, /posts/1, /posts/2, …
 * { "tags": ["posts", "post:1"] }   // purge all entries tagged with any tag
 * ```
 *
 * Response (200):
 * ```json
 * { "revalidated": true, "path": "/posts/1" }
 * ```
 */

import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidatePathPrefix, revalidateTag } from "./cache.js";
import { purgeCdnByTags } from "./cdn.js";
import { invalidateLive } from "../live/broadcaster.js";

export interface RevalidateBody {
  /** Purge a single cached page path. */
  path?: string;
  /** Purge all cached pages whose path starts with this prefix. */
  prefix?: string;
  /** Purge all server-function and page cache entries carrying any of these tags. */
  tags?: string[];
}

/** Returns `true` when the request is authorised to call the revalidate endpoint. */
export function checkRevalidateAuth(authorizationHeader: string | null | undefined): boolean {
  const secret = process.env["ALAB_REVALIDATE_SECRET"];
  if (!secret) {
    console.warn(
      "[alabjs] WARNING: ALAB_REVALIDATE_SECRET is not set. " +
      "The /_alabjs/revalidate endpoint accepts unauthenticated requests. " +
      "Set this variable in production.",
    );
    return true;
  }
  const provided = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice(7)
    : null;
  return (
    provided !== null &&
    provided.length === secret.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  );
}

/**
 * Apply a revalidation request. Returns a result object on success or an
 * `{ error }` object (with an HTTP status hint) on failure.
 */
export function applyRevalidate(
  body: unknown,
): { revalidated: true; path?: string; prefix?: string; tags?: string[] } | { status: number; error: string } {
  if (typeof body !== "object" || body === null) {
    return { status: 400, error: "Request body must be a JSON object." };
  }

  const { path, prefix, tags } = body as RevalidateBody;

  if (!path && !prefix && (!tags || tags.length === 0)) {
    return { status: 400, error: "Provide at least one of: path, prefix, tags." };
  }

  if (path) revalidatePath(path);
  if (prefix) revalidatePathPrefix(prefix);
  if (tags?.length) {
    revalidateTag({ tags });
    // Fire-and-forget: CDN purge is best-effort. In-process cache is already
    // cleared above, so a CDN miss will just hit the origin and re-warm the edge.
    void purgeCdnByTags(tags);
    // Notify live SSE connections subscribed to any of these tags.
    void invalidateLive({ tags });
  }

  return {
    revalidated: true,
    ...(path !== undefined && { path }),
    ...(prefix !== undefined && { prefix }),
    ...(tags !== undefined && { tags }),
  };
}
