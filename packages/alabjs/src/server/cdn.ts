/**
 * CDN cache header utilities for Alab.
 *
 * Pages that export `const cdnCache: CdnCache = { ... }` are opt-in public,
 * edge-cached pages. Alab sets response headers so any CDN or shared proxy
 * (Cloudflare, Fastly, Varnish, Nginx, AWS CloudFront) can cache them without
 * Vercel.
 *
 * ## Configuration
 *
 * Set `ALAB_CDN` in your environment to enable vendor-specific headers:
 *
 *   | Value        | Extra headers set                               |
 *   |--------------|-------------------------------------------------|
 *   | `cloudflare` | `CDN-Cache-Control`, `Cache-Tag`                |
 *   | `fastly`     | `Surrogate-Control`, `Surrogate-Key`            |
 *   | (unset)      | Universal `Cache-Control: public, s-maxage=N` only |
 *
 * ## Tag-based purge credentials
 *
 *   - Cloudflare: `CF_ZONE_ID` + `CF_API_TOKEN`
 *   - Fastly:     `FASTLY_SERVICE_ID` + `FASTLY_API_KEY`
 *
 * ## Important
 *
 * CDN-cached pages are **public pages** — they must not contain user-specific
 * state. Alab automatically skips CSRF token injection for pages that export
 * `cdnCache` because a shared cache would hand the same token to every visitor,
 * which defeats CSRF protection.
 */

import type { ServerResponse } from "node:http";

// ─── Public type ──────────────────────────────────────────────────────────────

export interface CdnCache {
  /** Seconds the CDN / shared proxy may cache this response. */
  maxAge: number;
  /**
   * Seconds the CDN may continue serving a stale response while it
   * revalidates the entry in the background (stale-while-revalidate).
   * Defaults to `maxAge` when omitted.
   */
  swr?: number;
  /**
   * Cache tags for targeted invalidation via `POST /_alabjs/revalidate`.
   *
   * - Cloudflare: emitted as `Cache-Tag: tag1,tag2`
   * - Fastly / Varnish: emitted as `Surrogate-Key: tag1 tag2`
   *
   * @example
   * export const cdnCache: CdnCache = {
   *   maxAge: 60,
   *   tags: ["posts", "post:42"],
   * };
   */
  tags?: readonly string[];
}

// ─── Internal ─────────────────────────────────────────────────────────────────

type CdnProvider = "cloudflare" | "fastly" | "none";

function detectProvider(): CdnProvider {
  switch (process.env["ALAB_CDN"]?.toLowerCase()) {
    case "cloudflare": return "cloudflare";
    case "fastly":     return "fastly";
    default:           return "none";
  }
}

// ─── Header helpers ───────────────────────────────────────────────────────────

/**
 * Set CDN-appropriate response headers for a page that opts in to edge caching
 * via `export const cdnCache = { ... }`.
 *
 * Always emits the universal `Cache-Control: public, s-maxage=N,
 * stale-while-revalidate=M` header. Vendor-specific headers are added when
 * `ALAB_CDN` is set.
 */
export function applyCdnHeaders(res: ServerResponse, cdnCache: CdnCache): void {
  const { maxAge, swr = maxAge, tags = [] } = cdnCache;

  // Universal — honoured by every shared proxy, CDN, and browser.
  res.setHeader(
    "cache-control",
    `public, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
  );

  const provider = detectProvider();

  if (provider === "cloudflare") {
    // Cloudflare reads CDN-Cache-Control with higher priority than Cache-Control,
    // allowing different TTLs at the edge vs. the browser.
    res.setHeader("cdn-cache-control", `max-age=${maxAge}`);
    if (tags.length > 0) {
      // Cache-Tag enables Cloudflare tag-based purge via their API.
      res.setHeader("cache-tag", [...tags].join(","));
    }
  } else if (provider === "fastly") {
    // Surrogate-Control is stripped by Fastly before forwarding to the browser,
    // so it can hold a much larger TTL than Cache-Control safely.
    res.setHeader("surrogate-control", `max-age=${maxAge}`);
    if (tags.length > 0) {
      // Surrogate-Key is Fastly's mechanism for instant surrogate-key purge.
      res.setHeader("surrogate-key", [...tags].join(" "));
    }
  }
}

// ─── CDN purge ────────────────────────────────────────────────────────────────

/**
 * Purge CDN cache entries by tag.
 *
 * Called from `/_alabjs/revalidate` **after** the in-process cache has been
 * cleared. Silently no-ops when `ALAB_CDN` is not configured or the required
 * credentials are absent — the TTL will expire the CDN entry naturally.
 */
export async function purgeCdnByTags(tags: readonly string[]): Promise<void> {
  if (tags.length === 0) return;

  switch (detectProvider()) {
    case "cloudflare": await purgeCloudflare(tags); break;
    case "fastly":     await purgeFastly(tags);     break;
    // "none": no CDN purge needed — in-process cache already cleared.
  }
}

async function purgeCloudflare(tags: readonly string[]): Promise<void> {
  const zoneId   = process.env["CF_ZONE_ID"];
  const apiToken = process.env["CF_API_TOKEN"];

  if (!zoneId || !apiToken) {
    console.warn(
      "[alabjs] CDN purge: ALAB_CDN=cloudflare but CF_ZONE_ID or CF_API_TOKEN is not set — skipping.",
    );
    return;
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tags: [...tags] }),
    },
  );

  if (!res.ok) {
    console.error(`[alabjs] Cloudflare cache purge failed (${res.status}): ${await res.text()}`);
  }
}

async function purgeFastly(tags: readonly string[]): Promise<void> {
  const serviceId = process.env["FASTLY_SERVICE_ID"];
  const apiKey    = process.env["FASTLY_API_KEY"];

  if (!serviceId || !apiKey) {
    console.warn(
      "[alabjs] CDN purge: ALAB_CDN=fastly but FASTLY_SERVICE_ID or FASTLY_API_KEY is not set — skipping.",
    );
    return;
  }

  // Fastly instant purge by surrogate key (POST /service/{id}/purge with
  // Surrogate-Key header containing space-separated tags).
  const res = await fetch(
    `https://api.fastly.com/service/${serviceId}/purge`,
    {
      method: "POST",
      headers: {
        "fastly-key":    apiKey,
        "surrogate-key": [...tags].join(" "),
        accept:          "application/json",
      },
    },
  );

  if (!res.ok) {
    console.error(`[alabjs] Fastly cache purge failed (${res.status}): ${await res.text()}`);
  }
}
