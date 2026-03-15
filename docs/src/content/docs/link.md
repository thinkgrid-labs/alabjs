---
title: Link Component
description: Client-side navigation without a full page reload.
sidebar:
  order: 2
---

The `<Link>` component enables SPA-style navigation between AlabJS pages. Clicking a link fetches the next page HTML and swaps the content in place — no full browser navigation, no white flash, no layout re-mount.

## Basic usage

```tsx
import { Link } from "alabjs/components";

<Link href="/about">About</Link>
<Link href="/posts/hello-world">Read post</Link>
```

All standard `<a>` attributes are supported. For external links and links with `target="_blank"`, `Link` falls back to a normal `<a>` tag — it only intercepts same-origin navigations.

## How navigation works

1. User clicks the link
2. `Link` calls `fetch(href)` and reads the response HTML
3. It extracts the `#alabjs-root` inner content, `<title>`, and `<meta>` tags from the response
4. `history.pushState` updates the browser URL
5. The `#alabjs-root` content is swapped in with a short CSS transition

This approach works without a client-side route manifest — it stays fully compatible with SSR streaming.

## Prefetching

`Link` prefetches the target page on hover. The request fires after a 300 ms debounce to avoid prefetching on accidental hovers. Prefetched HTML is cached in memory for 30 seconds.

To disable prefetching on a specific link:

```tsx
<Link href="/heavy-page" prefetch={false}>Open</Link>
```

To disable prefetching globally:

```ts
// alabjs.config.ts
export default {
  prefetch: false,
};
```

## Scroll restoration

By default, `Link` scrolls to the top of the page after navigation. To scroll to a specific element or disable scroll reset:

```tsx
<Link href="/posts" scroll={false}>Posts</Link>
<Link href="/posts#comments" scroll="auto">Comments</Link>
```

## Active link styling

`Link` sets `aria-current="page"` on the active link (when its `href` matches the current URL):

```tsx
<Link href="/about" className="nav-link">About</Link>

/* CSS */
.nav-link[aria-current="page"] {
  font-weight: bold;
  color: var(--accent);
}
```

## Transition animation

The swap uses a CSS `page-enter` animation class added to `#alabjs-root` during the transition. You can customise it in your `globals.css`:

```css
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

#alabjs-root.page-enter {
  animation: fade-in 150ms ease;
}
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `href` | `string` | required | Destination URL |
| `prefetch` | `boolean` | `true` | Prefetch on hover |
| `scroll` | `boolean \| "auto"` | `true` | Scroll to top after navigation |
| `replace` | `boolean` | `false` | Use `history.replaceState` instead of `pushState` |
| All `<a>` props | — | — | Passed through to the underlying `<a>` element |
