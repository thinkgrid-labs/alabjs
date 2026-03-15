---
title: Cache & ISR
description: Stale-while-revalidate page caching with the revalidate export and revalidatePath().
sidebar:
  order: 5
---

AlabJS supports Incremental Static Regeneration (ISR) — a page-level HTML cache that serves stale content instantly while regenerating in the background. Pages that do not change often can be cached for seconds, minutes, or hours without a full CDN setup.

## Enabling ISR on a page

Export a `revalidate` constant from any page:

```tsx
// app/blog/page.tsx

// Cache the HTML for 60 seconds.
export const revalidate = 60;

export default function BlogPage() {
  return <h1>Blog</h1>;
}
```

On the first request, AlabJS renders the page and stores the HTML in memory. For the next 60 seconds, all requests get the cached HTML immediately. After 60 seconds, the next request still gets the stale HTML but triggers a background re-render. The fresh HTML replaces the stale cache as soon as it's ready — zero downtime, zero waiting.

## Cache-status header

Every response includes an `x-alab-cache` header so you can inspect cache behaviour:

| Value | Meaning |
|---|---|
| `miss` | First render — no cache entry yet |
| `hit` | Served from cache, still fresh |
| `stale` | Served from cache, background revalidation triggered |

## Disabling cache for a page

Set `revalidate` to `0` or `false` to always render fresh:

```ts
export const revalidate = 0; // Never cache
```

This is the default — pages without `revalidate` are always rendered on demand.

## Programmatic invalidation

Call `revalidatePath` to force a specific path out of the cache before its TTL expires:

```ts
import { defineServerFn } from "alab/server";
import { revalidatePath } from "alab/cache";

export const publishPost = defineServerFn(async ({ id }) => {
  await db.posts.update({ where: { id }, data: { published: true } });

  // Invalidate the blog index and the specific post page
  revalidatePath("/blog");
  revalidatePath(`/blog/${id}`);
});
```

The next request to those paths triggers a fresh render and re-caches the result.

## Revalidating all pages

```ts
import { revalidateAll } from "alab/cache";

// Nuke the entire page cache — use sparingly.
revalidateAll();
```

## Stale-while-revalidate semantics

AlabJS's ISR implementation follows RFC 5861 stale-while-revalidate semantics:

1. **Miss** — No cache entry: render synchronously, store result, respond.
2. **Fresh hit** — Cache entry within TTL: respond immediately from cache.
3. **Stale hit** — Cache entry past TTL: respond from cache immediately, trigger background re-render, store fresh result.
4. **Revalidating** — A background re-render is already in progress: respond from stale cache, do not trigger a second re-render.

This guarantees at most one concurrent background render per path.

## ISR vs SSG

| Feature | SSG | ISR |
|---|---|---|
| When HTML is generated | At build time | On first request |
| How it updates | Requires a rebuild | Revalidates in background |
| Works for dynamic routes | Only with `generateStaticParams` | Always |
| CDN-compatible | Yes | Yes (with `Cache-Control: s-maxage`) |

Use SSG when content is fully known at build time. Use ISR for frequently-changing content that still benefits from caching.

## Production caching

In production, AlabJS sets `Cache-Control: s-maxage=N, stale-while-revalidate` on ISR responses, where `N` is your `revalidate` value. This allows CDNs (Cloudflare, Fastly, Varnish) to cache at the edge and serve from there instead of hitting your Node.js server.

## API Reference

### `export const revalidate: number | false`

Page-level export. Sets the cache TTL in seconds. `0` or `false` disables caching.

### `revalidatePath(path: string): void`

Removes the cache entry for `path`. The next request to that path renders fresh.

### `revalidateAll(): void`

Clears the entire page cache.

### `getCacheStatus(path: string): "miss" | "fresh" | "stale" | "revalidating"`

Returns the current cache status of a path. Useful in tests or admin panels.
