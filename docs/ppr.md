---
title: Partial Prerendering (PPR)
description: Serve a CDN-cached static HTML shell instantly, then stream dynamic content into data-ppr-hole placeholders.
---

Partial Prerendering (PPR) is a rendering mode where AlabJS pre-renders the **static shell** of a page at build time and streams **dynamic sections** in at request time. The shell is served from the CDN in milliseconds; users see layout immediately while data-heavy sections fill in behind it.

Think of it as SSR + SSG combined: the skeleton of the page is static and globally cached, but the content inside `<Dynamic>` boundaries is per-request.

## Enabling PPR on a page

Add two exports to any page:

```tsx
// app/dashboard/page.tsx
import { Dynamic } from "alabjs/components";

export const ssr = true;
export const ppr = true;

export default function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>

      {/* Rendered instantly from CDN cache */}
      <nav>...</nav>

      {/* Streamed in per-request */}
      <Dynamic id="metrics" fallback={<MetricsSkeleton />}>
        <LiveMetrics />
      </Dynamic>

      <Dynamic id="feed" fallback={<FeedSkeleton />}>
        <ActivityFeed />
      </Dynamic>
    </main>
  );
}
```

`export const ppr = true` opts the page into PPR mode. `export const ssr = true` is required so the page has a server-side render path for dynamic sections.

## The `<Dynamic>` component

`<Dynamic>` marks a subtree as per-request. It accepts:

| Prop | Type | Description |
|---|---|---|
| `id` | `string` | Stable identifier for this hole. Used to match the placeholder to live content. |
| `children` | `ReactNode` | The per-request content. Never included in the static shell. |
| `fallback` | `ReactNode` | Shown in the static shell **and** as the Suspense fallback while streaming. |

**Build time**: `<Dynamic>` renders `fallback` inside a `<div data-ppr-hole="{id}">` marker — children are omitted entirely.

**Runtime**: `<Dynamic>` becomes a `<Suspense>` boundary. Children stream in as their async work resolves.

```tsx
import { Dynamic } from "alabjs/components";

<Dynamic id="user-cart" fallback={<CartSkeleton />}>
  <UserCart userId={session.userId} />
</Dynamic>
```

Keep `id` values short, stable, and descriptive — treat them like React keys.

## How it works

### Build step

When you run `alab build`, AlabJS:

1. Compiles all pages with Vite + oxc.
2. Detects pages with `ppr = true` in the route manifest.
3. Renders each PPR page using `PPRShellProvider` — a React context that switches `<Dynamic>` into placeholder mode.
4. Saves the resulting HTML to `.alabjs/ppr-cache/<slug>.html`.

The shell file is a complete HTML document with `data-ppr-hole` divs where dynamic content will appear.

### Request time

When a request arrives for a PPR page:

1. AlabJS checks `.alabjs/ppr-cache/` for a pre-rendered shell.
2. If found, it injects the current build ID and serves the shell with `Cache-Control: public, s-maxage=3600`.
3. The browser receives the shell instantly (or from CDN) and React hydrates.
4. `<Dynamic>` boundaries fire their async data fetching; content streams or renders on the client.

If no shell exists (e.g. build was skipped), AlabJS falls back to normal SSR.

## Fallback skeletons

The `fallback` prop is what users see during loading. Make it lightweight — it is inlined into every CDN-cached response.

```tsx
function MetricsSkeleton() {
  return (
    <div className="animate-pulse grid grid-cols-3 gap-4">
      <div className="h-24 rounded bg-gray-200" />
      <div className="h-24 rounded bg-gray-200" />
      <div className="h-24 rounded bg-gray-200" />
    </div>
  );
}
```

## Cache TTL

PPR shells are served with `s-maxage=3600` (1 hour) by default. You can extend edge caching by pairing PPR with `cdnCache`:

```tsx
export const ppr = true;
export const ssr = true;

export const cdnCache = {
  maxAge: 86400, // 24 hours
  swr: 3600,
};
```

See [CDN Cache Headers](/cdn-cache) for full configuration.

## PPR vs SSR vs CSR

| | CSR | SSR | PPR |
|---|---|---|---|
| Static shell served by CDN | No | No | **Yes** |
| Dynamic per-request content | Client only | Full page | Dynamic sections only |
| Time to first byte | Slow | Fast | **Instant** |
| CDN-cacheable | No | No | **Yes** |
| Requires Node.js at runtime | No | Yes | Yes (for dynamic parts) |
| Config | Default | `ssr = true` | `ppr = true` + `ssr = true` |

PPR is ideal for pages that are mostly static (nav, layout, hero) but have one or two data-heavy sections (user feed, live metrics, cart count).

## Inspecting the cache

After `alab build`, the pre-rendered shells are in `.alabjs/ppr-cache/`:

```
.alabjs/
  ppr-cache/
    index.html          # /
    dashboard.html      # /dashboard
    posts___id_.html    # /posts/[id]
```

Filename encoding: leading `/` stripped, `[param]` → `__param_`, `/` → `__`.

## API Reference

### `export const ppr: true`

Page-level export. Enables Partial Prerendering for this page. Must be used together with `export const ssr = true`.

### `<Dynamic id fallback?>`

Marks a subtree as dynamic. At build time renders the `fallback` inside a `data-ppr-hole` wrapper. At runtime acts as a `<Suspense>` boundary.

```tsx
import { Dynamic } from "alabjs/components";
```

### `getPPRShell(routePath, pprCacheDir): string | null`

Internal API. Reads the pre-rendered shell for a given route path. Returns `null` if the cache file doesn't exist (triggers SSR fallback).
