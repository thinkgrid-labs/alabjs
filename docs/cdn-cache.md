---
title: CDN Cache Headers
description: Emit correct Cache-Control, CDN-Cache-Control, and Surrogate-Control headers from any page with a single export.
---

AlabJS can emit CDN-ready cache headers for any page without a reverse-proxy config file or platform-specific workarounds. Export `cdnCache` from a page and AlabJS sets the right headers for Cloudflare, Fastly, or any standard CDN automatically.

## Basic usage

```tsx
// app/blog/page.tsx
import type { CdnCache } from "alabjs";

export const cdnCache: CdnCache = {
  maxAge: 3600, // Cache at the edge for 1 hour
};

export const ssr = true;

export default function BlogPage() {
  return <h1>Blog</h1>;
}
```

This sets `Cache-Control: public, s-maxage=3600` on every response, telling any CDN (Cloudflare, Fastly, Varnish, CloudFront) to cache the page at the edge.

## Stale-while-revalidate

Add `swr` to allow serving stale content while the CDN fetches a fresh copy in the background:

```tsx
export const cdnCache: CdnCache = {
  maxAge: 3600,
  swr: 600, // Serve stale for up to 10 minutes while revalidating
};
```

This emits `Cache-Control: public, s-maxage=3600, stale-while-revalidate=600`.

## Cache tags

Tag a response so you can purge a group of pages at once — for example, all blog posts when an author updates their profile:

```tsx
export const cdnCache: CdnCache = {
  maxAge: 86400,
  tags: ["blog", "author-42"],
};
```

Tags are sent as `Cache-Tag` (Cloudflare) or `Surrogate-Key` (Fastly) depending on your configured CDN provider.

## Programmatic tag purge

Call `revalidateTag` from a server function to purge all pages sharing a tag:

```ts
import { defineServerFn } from "alabjs/server";
import { revalidateTag } from "alabjs/cache";

export const publishPost = defineServerFn(async ({ id, authorId }) => {
  await db.posts.update({ where: { id }, data: { published: true } });

  // Purge all CDN edges that cached pages tagged with these values
  await revalidateTag({ tags: ["blog", `author-${authorId}`] });
});
```

AlabJS calls the CDN purge API automatically (Cloudflare or Fastly) based on your `ALAB_CDN` environment variable. If no CDN is configured, the call is a no-op.

## CDN provider configuration

Set the `ALAB_CDN` environment variable to enable provider-specific headers and purge APIs.

### Cloudflare

```sh
ALAB_CDN=cloudflare
CLOUDFLARE_ZONE_ID=your-zone-id
CLOUDFLARE_API_TOKEN=your-api-token
```

AlabJS emits:
- `CDN-Cache-Control: public, max-age=N` — Cloudflare-specific TTL (bypasses browser cache)
- `Cache-Tag: tag1,tag2` — for tag-based purge

Purge endpoint called: `DELETE https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache`

### Fastly

```sh
ALAB_CDN=fastly
FASTLY_SERVICE_ID=your-service-id
FASTLY_API_TOKEN=your-api-token
```

AlabJS emits:
- `Surrogate-Control: max-age=N` — Fastly-specific TTL
- `Surrogate-Key: tag1 tag2` — space-separated, for tag-based purge

Purge endpoint called: `POST https://api.fastly.com/service/{service}/purge`

### Generic CDN / no config

Without `ALAB_CDN`, AlabJS emits only the standard header:

```
Cache-Control: public, s-maxage=N, stale-while-revalidate=M
```

This works with any CDN that respects `Cache-Control`.

## CSRF and public pages

Pages with `cdnCache` are treated as **public** — AlabJS skips CSRF cookie injection for them. This is intentional: a shared CDN cache would deliver the same CSRF token to every visitor, defeating CSRF protection.

If a page needs both CDN caching and authenticated forms, split the authenticated form into a `<Dynamic>` section (loaded client-side) and cache only the public shell.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ALAB_CDN` | No | CDN provider: `cloudflare` or `fastly`. Unset = generic. |
| `CLOUDFLARE_ZONE_ID` | Cloudflare | Zone ID from the Cloudflare dashboard. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare | API token with Cache Purge permission. |
| `FASTLY_SERVICE_ID` | Fastly | Service ID from the Fastly dashboard. |
| `FASTLY_API_TOKEN` | Fastly | API token with purge permission. |

## API Reference

### `export const cdnCache: CdnCache`

Page-level export. Enables CDN cache headers for this page.

```ts
import type { CdnCache } from "alabjs";
```

```ts
interface CdnCache {
  /** Shared cache TTL in seconds (sets s-maxage). */
  maxAge: number;
  /** Stale-while-revalidate window in seconds. */
  swr?: number;
  /** Cache tags for group purge. */
  tags?: string[];
}
```

### `revalidateTag({ tags }): Promise<void>`

Purges all CDN edges that cached responses tagged with any of the given tags. Fire-and-forget safe — errors are logged but do not throw.

```ts
import { revalidateTag } from "alabjs/cache";
```

### `revalidatePath(path): void`

Removes the in-process ISR cache for `path`. For full edge purge, use `revalidateTag` with a matching tag on the page.

See [Cache & ISR](/reference/cache) for ISR-specific documentation.
