---
title: Analytics
description: Built-in Core Web Vitals collection. Real user metrics per route — no third-party scripts, no data leaving your server.
---

AlabJS ships a zero-dependency analytics pipeline. Drop `<Analytics />` into your root layout and get real user Core Web Vitals (LCP, CLS, INP, TTFB, FCP) aggregated per route — all stored in your own server's memory, nothing sent to a third party.

## Setup

Add `<Analytics />` to your root layout:

```tsx
// app/layout.tsx
import { Analytics } from "alabjs/components";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Analytics />
    </>
  );
}
```

That's it. The component instruments the browser's `PerformanceObserver` API, collects vitals, and sends them to `/_alabjs/vitals` via `navigator.sendBeacon` when the user navigates away or closes the tab.

## Viewing metrics

Query the dashboard endpoint from any HTTP client:

```sh
curl -H "Authorization: Bearer $ALAB_ANALYTICS_SECRET" \
     https://yoursite.com/_alabjs/analytics
```

Response:

```json
{
  "routes": {
    "/": {
      "pageviews": 142,
      "lcp_p75": 1180,
      "cls_p75": 0.03,
      "inp_p75": 72,
      "ttfb_p75": 210,
      "fcp_p75": 860
    },
    "/blog": {
      "pageviews": 38,
      "lcp_p75": 2400,
      "cls_p75": 0.01,
      "inp_p75": 95,
      "ttfb_p75": 180,
      "fcp_p75": 740
    }
  },
  "asOf": "2026-03-16T08:42:11.000Z"
}
```

All values are **p75** (75th percentile) — the threshold Google uses for Core Web Vitals pass/fail. Units:

| Metric | Full name | Unit | Good threshold |
|---|---|---|---|
| `lcp_p75` | Largest Contentful Paint | ms | < 2500 ms |
| `cls_p75` | Cumulative Layout Shift | score | < 0.1 |
| `inp_p75` | Interaction to Next Paint | ms | < 200 ms |
| `ttfb_p75` | Time to First Byte | ms | < 800 ms |
| `fcp_p75` | First Contentful Paint | ms | < 1800 ms |

`pageviews` counts the number of LCP events received for a route, which corresponds to the number of page loads.

## Securing the dashboard

Set `ALAB_ANALYTICS_SECRET` in your environment to protect the dashboard endpoint:

```sh
# .env.production
ALAB_ANALYTICS_SECRET=your-secret-here
```

Without this variable set, the endpoint is **open to anyone** — always set it in production.

If `ALAB_ANALYTICS_SECRET` is not set, AlabJS falls back to checking `ALAB_REVALIDATE_SECRET` so you can share one secret for all internal endpoints.

## Custom endpoint

The `endpoint` prop overrides the beacon destination — useful if you want to proxy vitals through a custom route or forward them to an external service:

```tsx
<Analytics endpoint="/api/metrics" />
```

## How it works

### Client side

`<Analytics>` registers three `PerformanceObserver` listeners:

- **LCP** — `largest-contentful-paint` — tracks the last reported entry (LCP can update multiple times during page load)
- **CLS** — `layout-shift` — accumulates shift scores using the session-window algorithm (matches Google's CrUX methodology)
- **INP** — `event` — tracks the worst interaction duration across the session
- **FCP** — `paint` — captured inline from the observer
- **TTFB** — read directly from `performance.getEntriesByType("navigation")`

LCP, CLS, and INP are flushed on `visibilitychange` (tab close / page navigation) using `navigator.sendBeacon` so the browser doesn't wait for a response before unloading.

### Server side

The `POST /_alabjs/vitals` endpoint is unauthenticated (browsers don't have secrets). Each beacon is a small JSON object:

```json
{ "name": "LCP", "value": 1180, "route": "/blog" }
```

The server stores up to **500 samples per metric per route** in a ring buffer. When the buffer is full, the oldest sample is evicted. This caps memory usage at roughly 500 routes × 5 metrics × 500 samples × 8 bytes ≈ **10 MB** worst case.

p75 is computed on read (`GET /_alabjs/analytics`), not on write — no background processing, no blocking.

## Persistence

The current implementation is **in-memory only**. Metrics reset when the server restarts. This is intentional for V1 — it keeps the implementation zero-dependency and zero-config.

For persistence across restarts, you can periodically poll `/_alabjs/analytics` and write the snapshot to a database or time-series store from a cron job or external monitoring service.

## API Reference

### `<Analytics endpoint?>`

Client component. Instruments Core Web Vitals and sends beacons to the AlabJS vitals endpoint.

```tsx
import { Analytics } from "alabjs/components";
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `endpoint` | `string` | `"/_alabjs/vitals"` | URL to POST beacons to. |

### `POST /_alabjs/vitals`

Receives a Core Web Vitals beacon from the browser. No authentication required. Always responds `204 No Content`.

**Body** (JSON):
```ts
{ name: "LCP" | "CLS" | "INP" | "TTFB" | "FCP"; value: number; route: string }
```

### `GET /_alabjs/analytics`

Returns a JSON snapshot of all collected metrics. Requires `Authorization: Bearer <ALAB_ANALYTICS_SECRET>` when the environment variable is set.

### Environment variables

| Variable | Description |
|---|---|
| `ALAB_ANALYTICS_SECRET` | Bearer token required to read `/_alabjs/analytics`. |
| `ALAB_REVALIDATE_SECRET` | Fallback if `ALAB_ANALYTICS_SECRET` is not set. |
