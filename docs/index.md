---
layout: home

hero:
  name: "🔥 AlabJS"
  text: "Full-stack React, with a Rust core."
  tagline: Sensible defaults. Explicit boundaries. Any host.
  actions:
    - theme: brand
      text: Get Started
      link: /installation
    - theme: alt
      text: Introduction
      link: /introduction

features:
  - title: Rust-powered compiler
    details: Built on oxc — the same parser powering Vite 8's Rolldown. TypeScript and JSX compilation is fast; server/client boundary violations are caught at build time, not at runtime.
  - title: Secure by default
    details: Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) and CSRF protection are active on every project without any configuration.
  - title: CSR by default, SSR opt-in
    details: Pages render on the client unless you add `export const ssr = true`. Opt-in SSR keeps interactive apps light while giving content pages full server rendering.
  - title: File-system routing
    details: Drop a `page.tsx` and get a route. Layouts, loading states, error boundaries, and API routes follow the same convention — no manual registration.
  - title: Server Functions
    details: Define server-only logic in `.server.ts` files with `defineServerFn`. The Rust compiler strips them from the browser bundle and generates type-safe stubs automatically.
  - title: Live Components
    details: Name a file `*.live.tsx` and it streams updated HTML to the browser over SSE on a timer or on-demand. No client-side state, no polling, no WebSocket server needed.
  - title: Type-safe routing
    details: Every page route is reflected in a generated `AlabRoutes` union. Unknown paths in `<RouteLink to>`, `<Link href>`, and `navigate()` are caught at build time by the Rust route checker.
  - title: Image optimization
    details: The `<Image>` component converts to WebP, generates a responsive `srcset`, and lazy-loads by default. Blur-up placeholders are available via `generateBlurPlaceholder`.
  - title: Partial Prerendering (PPR)
    details: Export `ppr = true` to serve a CDN-cached static HTML shell. `<Dynamic>` boundaries stream per-request content behind it — no full-page reload, no client JS required for the shell.
  - title: CDN Cache Headers
    details: Export `cdnCache` to emit `Cache-Control`, `CDN-Cache-Control`, and `Surrogate-Control` headers. Tag-based purge via `revalidateTag`. Works with Cloudflare, Fastly, or any standard CDN.
  - title: Skew protection
    details: A build ID (git SHA → FNV-1a hash fallback) is stamped at compile time. The client detects a stale JS bundle after deploy and performs a hard reload automatically.
  - title: Built-in analytics
    details: Add `<Analytics />` to your root layout. Real-user Core Web Vitals (LCP, CLS, INP, TTFB, FCP) are collected per route, stored in-process, and served at `/_alabjs/analytics`. No third-party scripts.
  - title: Safe environment variables
    details: Variables prefixed with `ALAB_PUBLIC_` are inlined into the client bundle. Everything else is server-only. Secrets cannot be accidentally shipped to the browser.
  - title: Server-Sent Events
    details: Stream data from any API route with `defineSSEHandler`. Subscribe on the client with `useSSE` — automatic reconnection, named event types, and typed payloads included.
  - title: Offline mutations
    details: A service worker queues failed server function calls in IndexedDB and replays them when connectivity returns. `useOfflineMutations` exposes queue state and a manual replay trigger.
  - title: Microfrontend-ready
    details: Native ESM + import maps federation — no webpack runtime required. Expose components with `federation.exposes`, consume them with `useFederatedComponent`. React is shared as a singleton. SSR of remote components is not yet supported (v0.x limitation).
  - title: Monorepo-native
    details: The `--cwd` flag targets any app in a pnpm workspace without changing directories. Shared component libraries and shared server functions work out of the box.
---
