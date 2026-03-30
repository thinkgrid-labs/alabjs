---
title: Core Concepts
description: The mental models behind AlabJS — rendering modes, route kinds, server/client boundary, and the build pipeline.
---

# Core Concepts

Understanding these five ideas covers 90% of how AlabJS behaves.

## 1. Rendering Modes

AlabJS has four rendering modes. Each is a deliberate choice per route — never a global setting.

| Mode | How it works | When to use |
|---|---|---|
| **CSR** (default) | Page renders in the browser. Server sends a minimal HTML shell. | Dashboards, auth-gated apps, highly interactive UIs. |
| **SSR** | Server renders the full HTML on every request. Client hydrates. | Public pages, SEO-critical content, content that changes per user. |
| **PPR** (Partial Prerendering) | Static HTML shell pre-rendered at build time; dynamic sections stream in. | Marketing pages with personalised widgets, landing pages. |
| **Live** | Server renders HTML fragments on an interval or on-demand; browser receives them over SSE and swaps DOM. | Real-time dashboards, tickers, feeds — no client-side state needed. |

### Choosing a mode

```
Is this page public / needs SEO?
  Yes → SSR (export const ssr = true)
  No  → CSR (default, no config needed)

Does it have a static outer shell + dynamic inner content?
  Yes → PPR (export const ppr = true, export const ssr = true)

Does the content update in real time from the server?
  Yes → Live (name the file *.live.tsx or add "use live")
```

---

## 2. Route Kinds

The file name inside `app/` determines what a file does. AlabJS recognises six route kinds:

| File | Kind | Purpose |
|---|---|---|
| `page.tsx` | **page** | Renders a UI at the current path |
| `layout.tsx` | **layout** | Wraps all child pages in a shared shell |
| `loading.tsx` | **loading** | Suspense fallback shown while data loads |
| `error.tsx` | **error** | Error boundary for the current subtree |
| `route.ts` | **api** | HTTP endpoint (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) |
| `*.live.tsx` / `"use live"` | **live** | Server-rendered real-time component |

The Rust scanner builds a **route manifest** at build time. Every route kind maps to a stable path pattern. The manifest is written to `.alabjs/dist/route-manifest.json` and is the single source of truth for the whole system.

---

## 3. Server / Client Boundary

The boundary is enforced by **file naming**, not directives.

```
app/
  page.tsx              ← runs in the browser (CSR default)
  page.tsx + ssr=true   ← runs on the server AND the browser
  route.ts              ← runs on the server only (API handler)

lib/
  db.server.ts          ← runs on the server only
  utils.ts              ← shared (no DB imports allowed here)
```

Files ending in `.server.ts` are **never bundled for the browser**. The Rust compiler enforces this at build time — if a client module imports a `.server.ts` file directly, the build fails with a clear error.

Live component files (`.live.tsx`) follow the same rule: the actual component code only runs on the server. The browser receives a thin stub (`LiveMount`) that opens the SSE connection.

---

## 4. Request Lifecycle

```
Browser request
  │
  ▼
Middleware (middleware.ts)
  │  auth checks, redirects, locale detection
  ▼
Route handler
  ├── page.tsx (CSR) → serve HTML shell, browser fetches JS, renders
  ├── page.tsx (SSR) → render React to HTML on server, stream to browser
  ├── *.live.tsx     → serve SSR snapshot + open SSE stream
  └── route.ts       → run GET/POST/… handler, return Response
  │
  ▼
Server functions (*.server.ts)
  │  called by useServerData / useMutation / live components
  └── database, external APIs, secrets — never reach the browser
```

---

## 5. Build Pipeline

Running `alab build` executes these steps in order:

```
1. Vite + Rolldown (Rust)
   └── Client bundle → .alabjs/dist/client/

2. Rust route scanner
   └── Walks app/, classifies files, writes route-manifest.json

3. Route type generator
   └── Writes .alabjs/routes.d.ts (AlabRoutes union + typed navigate)

4. TypeScript type checker
   └── tsc --noEmit (routes.d.ts is available here)

5. Rust route reference checker
   └── Validates <RouteLink to>, <Link href>, navigate() against manifest

6. esbuild SSR bundle
   └── Server pages → .alabjs/dist/server/

7. PPR shells (if any)
   └── Pre-renders static HTML → .alabjs/ppr-cache/

8. Build ID
   └── git SHA (or FNV-1a hash fallback) → .alabjs/dist/BUILD_ID
```

The key ordering constraint: **route types are generated before `tsc` runs**, so `AlabRoutes` is always resolvable on the first build.

---

## 6. AlabRoutes — Type-Safe Navigation

Every page route in `app/` is reflected in a generated TypeScript union:

```ts
// .alabjs/routes.d.ts  (auto-generated — do not edit)
export type AlabRoutes = "/" | "/about" | `/users/${string}` | `/posts/${string}`;
```

This type is used by `navigate()`, `<RouteLink to>`, and `<Link href>` so the compiler catches dead links at build time.

```tsx
import { navigate } from "alabjs/router";

// ✅ known route
navigate("/about");

// ✗ build error: "/abuot" is not assignable to AlabRoutes
navigate("/abuot");
```

To enable these checks, add `.alabjs/routes.d.ts` to your `tsconfig.json`:

```json
{
  "include": ["app", ".alabjs/routes.d.ts"]
}
```

---

## 7. Live Components in Brief

A live component is a server-rendered HTML fragment that updates automatically. No client-side state. No manual fetch loops.

```tsx
// app/ticker.live.tsx
export const liveInterval = 3;          // re-render every 3 seconds
export const liveTags = ["market"];     // also re-render on invalidateLive({ tags: ["market"] })

export default function Ticker() {
  const price = getLatestPrice();       // runs on the server, never in the browser
  return <div>${price.toFixed(2)}</div>;
}
```

The browser gets a `<div data-live-id="…">` placeholder. The server pushes updated HTML over SSE. React hydration is skipped entirely for updates — the DOM is patched directly.

See [Live Components](/live-components) for the full guide.
