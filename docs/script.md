---
title: Script Component
description: Load third-party scripts with strategy control and no LCP impact.
---

The `<Script>` component loads third-party scripts with control over timing. Loading scripts at the wrong time is one of the most common causes of poor Lighthouse scores — `<Script>` makes the right choice the default.

## Basic usage

```tsx
import { Script } from "alabjs/components";

// Load after the page is interactive (safe default)
<Script src="https://cdn.example.com/widget.js" strategy="afterInteractive" />
```

## Strategies

| Strategy | When it loads | Use for |
|---|---|---|
| `beforeInteractive` | Before hydration, blocks render | Critical polyfills, consent management |
| `afterInteractive` | After hydration, non-blocking | Analytics, chat widgets, A/B testing |
| `lazyOnload` | When the browser is idle | Low-priority tracking, social embeds |

### `afterInteractive` (recommended default)

```tsx
<Script
  src="https://analytics.example.com/script.js"
  strategy="afterInteractive"
/>
```

Injected after React hydration. Does not block rendering or LCP. Suitable for 90% of third-party scripts.

### `beforeInteractive`

```tsx
<Script
  src="https://cdn.example.com/polyfill.js"
  strategy="beforeInteractive"
/>
```

Placed in `<head>` with no `defer` or `async`. Blocks rendering — use only for scripts that must run before the page is interactive (cookie consent banners, critical polyfills).

### `lazyOnload`

```tsx
<Script
  src="https://connect.facebook.net/en_US/sdk.js"
  strategy="lazyOnload"
  onLoad={() => console.log("FB SDK ready")}
/>
```

Loads when the browser is idle (via `requestIdleCallback`). Ideal for social embeds and low-priority tracking that doesn't need to fire immediately.

## Inline scripts

Pass children instead of `src` for inline scripts:

```tsx
<Script strategy="afterInteractive">
  {`window.dataLayer = window.dataLayer || [];`}
</Script>
```

## `onLoad` callback

```tsx
<Script
  src="https://maps.googleapis.com/maps/api/js"
  strategy="afterInteractive"
  onLoad={() => {
    const map = new google.maps.Map(document.getElementById("map"), {
      center: { lat: -34.397, lng: 150.644 },
      zoom: 8,
    });
  }}
/>
```

## `onError` callback

```tsx
<Script
  src="https://cdn.example.com/optional.js"
  strategy="lazyOnload"
  onError={(e) => console.warn("Optional script failed to load", e)}
/>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `src` | `string` | — | URL of the script |
| `strategy` | `"beforeInteractive" \| "afterInteractive" \| "lazyOnload"` | `"afterInteractive"` | Load timing |
| `onLoad` | `() => void` | — | Fired after script loads |
| `onError` | `(e: Event) => void` | — | Fired if script fails to load |
| `id` | `string` | — | Prevents duplicate injection |
| `children` | `string` | — | Inline script content |
| All `<script>` attrs | — | — | Passed through |

## Preventing duplicates

If the same script is rendered multiple times (e.g. in a component used on many pages), set an `id` prop. AlabJS deduplicates scripts with the same `id` so the script is injected only once:

```tsx
<Script id="my-analytics" src="..." strategy="afterInteractive" />
```
