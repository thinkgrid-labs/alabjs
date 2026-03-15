---
title: SSR & CSR
description: Opt-in server-side rendering in Alab.
---

Alab defaults to **CSR (Client-Side Rendering)** — the server sends a minimal HTML shell and React bootstraps in the browser. This is the fastest option for dashboards, authenticated apps, and anything behind a login.

## Enabling SSR for a route

Add `export const ssr = true` to any page file:

```tsx
// app/blog/[slug]/page.tsx
export const ssr = true;

export default function BlogPost() {
  return <article>...</article>;
}
```

Alab will call `renderToPipeableStream` for that route and stream the full HTML to the client.

## When to use SSR

| Use case | Recommendation |
|----------|----------------|
| Public pages (blog, marketing) | ✅ SSR |
| Authenticated dashboards | CSR (faster, no SSR overhead) |
| SEO-critical pages | ✅ SSR |
| Highly interactive apps | CSR |

## Metadata

Both SSR and CSR pages support the `metadata` export for `<title>`, `<meta description>`, OG tags, and more. In CSR mode, meta tags are still server-rendered into the HTML shell before hydration.
