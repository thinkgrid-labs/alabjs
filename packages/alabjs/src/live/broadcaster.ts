/**
 * In-process tag-based pub/sub broadcaster for live components.
 *
 * Each SSE connection subscribes to the tags returned by its component's
 * `liveTags(props)` export. When `invalidateLive({ tags })` is called from
 * anywhere on the server (route handler, webhook, cron job), every matching
 * subscriber is notified and re-renders its HTML fragment over SSE.
 *
 * Current implementation: plain Node.js `EventEmitter` — zero dependencies,
 * zero config, works for any single-process deployment (Railway, Fly.io,
 * Render, Heroku — single dyno/instance covers the vast majority of use cases).
 *
 * ─── Redis adapter (ON HOLD) ──────────────────────────────────────────────────
 * Multi-instance deployments (PM2 cluster, multiple replicas behind a load
 * balancer) need cross-process pub/sub: `invalidateLive` called on instance A
 * must wake SSE connections on instances B and C.
 *
 * A Redis adapter is planned but intentionally deferred:
 *  - Most alab apps run single-instance and would pay Redis cost for no benefit
 *  - Vertical scaling (bigger machine) handles serious load before needing replicas
 *  - The interface here (`subscribeToTag` / `broadcastTag`) is already the right
 *    abstraction; swapping the backend is a ~20-line change when needed
 *
 * When it ships it will be an optional package:
 *
 * ```ts
 * // alabjs.config.ts
 * import { redisBroadcaster } from "@alabjs/broadcaster-redis";
 *
 * export default defineConfig({
 *   live: { broadcaster: redisBroadcaster({ url: process.env.REDIS_URL }) },
 * });
 * ```
 *
 * Tracking issue: https://github.com/alab-framework/alab/issues — search
 * "broadcaster-redis" to follow progress or upvote.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { EventEmitter } from "node:events";

// One emitter per process — all SSE handlers share it.
const _emitter = new EventEmitter();
// Prevent Node.js MaxListenersExceededWarning on pages with many live components.
_emitter.setMaxListeners(0);

const TAG_EVENT_PREFIX = "live:tag:";

/**
 * Subscribe a callback to a specific tag.
 *
 * @returns An unsubscribe function — call it on SSE client disconnect.
 */
export function subscribeToTag(tag: string, callback: () => void): () => void {
  const event = TAG_EVENT_PREFIX + tag;
  _emitter.on(event, callback);
  return () => _emitter.off(event, callback);
}

/**
 * Broadcast a tag change to all live SSE connections subscribed to it.
 */
export function broadcastTag(tag: string): void {
  _emitter.emit(TAG_EVENT_PREFIX + tag);
}

/**
 * Invalidate live components by tag.
 *
 * Triggers an immediate re-render push for every SSE connection subscribed
 * to any of the given tags. Called from route handlers, webhooks, cron jobs,
 * or the existing `/_alabjs/revalidate` endpoint.
 *
 * ```ts
 * import { invalidateLive } from "alabjs/server";
 * await invalidateLive({ tags: ["stock:AAPL", "stock:GOOG"] });
 * ```
 */
export async function invalidateLive(opts: { tags: string[] }): Promise<void> {
  for (const tag of opts.tags) {
    broadcastTag(tag);
  }
}
