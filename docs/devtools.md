---
title: Dev Tools
description: Built-in developer toolbar showing route info, server/client boundaries, params, and more — only in alab dev.
---

AlabJS ships a built-in dev toolbar that appears in every page during `alab dev`. It shows you exactly what's happening on the current page — render mode, the server/client boundary tree, active params, and layout chain — without needing any browser extension.

The toolbar is **never injected in production builds**. It is zero-cost in `alab build` / `alab start`.

## Toolbar

A floating bar appears at the bottom-left of every page:

```
🔥  dashboard/page.tsx  [SSR]  ▲
```

Click the bar to expand the panel.

## Panel sections

### Route

Shows the current page's file path and render mode.

| Field | Description |
|---|---|
| file | Relative path from `app/` — click to open in your editor |
| mode | `SSR`, `CSR`, or `PPR` |

### Server / Client boundaries

A tree showing the full component chain for the current page — layouts (outermost → innermost) plus the page itself, each tagged with its execution context:

```
app/layout.tsx              [SERVER]
  app/dashboard/layout.tsx  [SERVER]
    app/dashboard/page.tsx  [SSR]
```

| Badge | Meaning |
|---|---|
| `SERVER` | Runs on the server (layouts always run server-side) |
| `CLIENT` | CSR page — React mounts in the browser from a static shell |
| `PPR` | Pre-rendered static shell, dynamic sections stream in |

This is the same boundary model that the Rust compiler enforces at build time — the toolbar makes it visible at runtime.

### Params

Shown when the current route has dynamic segments or query parameters.

| Field | Description |
|---|---|
| route | URL segment params, e.g. `id=42` for `/posts/[id]` |
| search | Query string params, e.g. `?tab=settings` |

### Build

Shows the current dev session's build ID (a `dev-` prefixed timestamp). Each `alab dev` restart generates a new ID — any browser tab left open from before the restart will hard-reload on the next navigation.

## Debug endpoint

In dev mode, AlabJS exposes a JSON endpoint at `/_alabjs/__devtools` that dumps all known routes, API routes, and server functions:

```sh
curl http://localhost:3000/_alabjs/__devtools | jq
```

```json
{
  "routes": [
    { "pattern": "^\\/blog\\/([^/]+)\\/?$", "file": "app/blog/[slug]/page.tsx", "ssr": true, "params": ["slug"] },
    { "pattern": "^\\/\\/?$", "file": "app/page.tsx", "ssr": false, "params": [] }
  ],
  "apiRoutes": [
    { "pattern": "^\\/api\\/posts\\/?$", "file": "app/api/posts/route.ts", "params": [] }
  ],
  "serverFunctions": [
    "app/blog/[slug]/page.server.ts#getPost",
    "app/api/posts/route.ts#createPost"
  ],
  "buildId": "dev-m2k3p9"
}
```

This endpoint is only available in `alab dev` — it does not exist in `alab start`.

## Click-to-source

Every file path in the toolbar panel is a link that opens the file directly in your editor via Vite's built-in click-to-source feature. Works with VS Code, WebStorm, and any editor that Vite supports.

Set your editor in `vite.config.ts` if Vite doesn't auto-detect it:

```ts
// vite.config.ts
export default {
  server: {
    open: true,
  },
};
```

Or via the `LAUNCH_EDITOR` environment variable:

```sh
LAUNCH_EDITOR=code alab dev   # VS Code
LAUNCH_EDITOR=webstorm alab dev
```
