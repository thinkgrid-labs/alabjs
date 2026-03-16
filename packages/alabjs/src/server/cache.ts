/**
 * Alab in-process cache for server functions.
 *
 * Nothing is cached unless you explicitly opt in — no implicit layers.
 * You own the key, the TTL, and the invalidation.
 *
 * @example
 * ```ts
 * // app/posts/[id]/page.server.ts
 * export const getPost = defineServerFn(
 *   async ({ params }) => db.posts.findById(params.id),
 *   { cache: { ttl: 60, tags: ["posts", `post:${params.id}`] } },
 * );
 *
 * // Invalidate from another server function or API route
 * import { invalidateCache } from "alabjs/cache";
 * await invalidateCache({ tags: ["posts"] });
 * ```
 */

interface CacheEntry {
  data: unknown;
  /** Absolute expiry timestamp (ms since epoch). */
  expires: number;
  tags: string[];
}

/** Sentinel value returned when a cache key has no valid entry. */
const CACHE_MISS: unique symbol = Symbol("alab:cache_miss");

/** Global in-process LRU-style cache. Shared across all server function calls. */
const _store = new Map<string, CacheEntry>();

export { CACHE_MISS };

/** Retrieve a cached value. Returns `CACHE_MISS` if absent or expired. */
export function getCached(key: string): unknown | typeof CACHE_MISS {
  const entry = _store.get(key);
  if (!entry) return CACHE_MISS;
  if (Date.now() > entry.expires) {
    _store.delete(key);
    return CACHE_MISS;
  }
  return entry.data;
}

/** Store a value in the cache with a TTL (seconds) and optional tags. */
export function setCache(
  key: string,
  data: unknown,
  opts: { ttl: number; tags?: string[] },
): void {
  _store.set(key, {
    data,
    expires: Date.now() + opts.ttl * 1_000,
    tags: opts.tags ?? [],
  });
}

/**
 * Invalidate all cache entries that carry at least one of the given tags.
 *
 * @example
 * ```ts
 * import { invalidateCache } from "alabjs/cache";
 * await invalidateCache({ tags: ["posts"] });
 * ```
 */
export function invalidateCache(opts: { tags: string[] }): void {
  for (const [key, entry] of _store) {
    if (opts.tags.some((t) => entry.tags.includes(t))) {
      _store.delete(key);
    }
  }
}

/**
 * Invalidate a specific cache entry by its exact key.
 * Prefer `invalidateCache({ tags })` for logical invalidation.
 */
export function invalidateCacheKey(key: string): void {
  _store.delete(key);
}

// ─── Page-level HTML cache (ISR) ─────────────────────────────────────────────

interface PageCacheEntry {
  html: string;
  expires: number;
  /** Original TTL in seconds — used to compute the stale-while-revalidate window. */
  ttl: number;
  /** Whether a background revalidation is already in flight. */
  revalidating: boolean;
  /** Tags for on-demand invalidation via `revalidateTag`. */
  tags: string[];
}

const _pageStore = new Map<string, PageCacheEntry>();

/**
 * Retrieve a cached HTML page. Returns `null` if absent or fully expired
 * (more than 2× TTL past — serves stale-while-revalidate window).
 */
export function getCachedPage(pathname: string): { html: string; stale: boolean } | null {
  const entry = _pageStore.get(pathname);
  if (!entry) return null;
  const now = Date.now();
  // Still fresh
  if (now <= entry.expires) return { html: entry.html, stale: false };
  // Stale-while-revalidate: serve stale for up to 2× TTL, trigger background regen
  const swrWindow = Math.max(entry.ttl * 2 * 1_000, 60_000);
  if (now <= entry.expires + swrWindow) {
    return { html: entry.html, stale: true };
  }
  _pageStore.delete(pathname);
  return null;
}

/** Store a rendered HTML page with a TTL (seconds). */
export function setCachedPage(pathname: string, html: string, ttl: number, tags: string[] = []): void {
  _pageStore.set(pathname, { html, expires: Date.now() + ttl * 1_000, ttl, revalidating: false, tags });
}

/** Mark a page as currently being revalidated to prevent concurrent regen. */
export function markPageRevalidating(pathname: string): void {
  const entry = _pageStore.get(pathname);
  if (entry) entry.revalidating = true;
}

/** Check if a page is currently being revalidated in the background. */
export function isPageRevalidating(pathname: string): boolean {
  return _pageStore.get(pathname)?.revalidating ?? false;
}

/**
 * Purge a specific page's cached HTML, forcing a fresh render on the next request.
 *
 * @example
 * ```ts
 * import { revalidatePath } from "alabjs/cache";
 * await revalidatePath("/posts/1"); // next request regenerates the page
 * ```
 */
export function revalidatePath(pathname: string): void {
  _pageStore.delete(pathname);
}

/**
 * Purge all cached pages whose pathname starts with the given prefix.
 *
 * @example
 * ```ts
 * await revalidatePath("/posts"); // clears /posts, /posts/1, /posts/2, ...
 * ```
 */
export function revalidatePathPrefix(prefix: string): void {
  for (const key of _pageStore.keys()) {
    if (key.startsWith(prefix)) _pageStore.delete(key);
  }
}

/**
 * Purge all server-function cache entries AND page HTML cache entries
 * that carry at least one of the given tags.
 *
 * @example
 * ```ts
 * import { revalidateTag } from "alabjs/cache";
 * revalidateTag({ tags: ["posts"] }); // clears both data and page caches
 * ```
 */
export function revalidateTag(opts: { tags: string[] }): void {
  // Server-function data cache
  invalidateCache(opts);
  // Page HTML cache (ISR)
  for (const [path, entry] of _pageStore) {
    if (opts.tags.some((t) => entry.tags.includes(t))) {
      _pageStore.delete(path);
    }
  }
}

/** Return a snapshot of all live cache entries (for the dev Cache Inspector). */
export function inspectCache(): Array<{
  key: string;
  tags: string[];
  expiresIn: number;
}> {
  const now = Date.now();
  const result: Array<{ key: string; tags: string[]; expiresIn: number }> = [];
  for (const [key, entry] of _store) {
    const expiresIn = entry.expires - now;
    if (expiresIn > 0) result.push({ key, tags: entry.tags, expiresIn: Math.ceil(expiresIn / 1000) });
    else _store.delete(key);
  }
  return result;
}
