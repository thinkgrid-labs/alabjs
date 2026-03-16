---
layout: home

hero:
  name: "🔥 AlabJS"
  text: "Type-safe React Framework, enforced by Rust."
  tagline: Blazing builds. Explicit boundaries. Any host.
  actions:
    - theme: brand
      text: Get Started
      link: /installation
    - theme: alt
      text: Introduction
      link: /introduction

features:
  - title: Rust-powered compiler
    details: oxc 0.119 compiles TypeScript and JSX 5–10× faster than esbuild. Server/client boundary violations caught at build time.
  - title: Secure by default
    details: Security headers, CSRF protection, and server/client code isolation — on every project, without writing a single line of config.
  - title: Zero-config SSR + CSR
    details: Pages render on the client by default. Add `export const ssr = true` to any page for full server-side rendering.
  - title: File-system routing
    details: Drop a `page.tsx` and get a route. Layouts, loading states, error boundaries, and API routes all follow the same convention.
  - title: Server Functions
    details: Define `defineServerFn` in `.server.ts` files. The Rust compiler strips them from the browser bundle and generates type-safe fetch stubs.
  - title: Built-in image optimization
    details: The `<Image>` component converts to WebP, generates responsive `srcset`, and lazy-loads by default — powered by the same Rust binary.
  - title: Partial Prerendering (PPR)
    details: Export `ppr = true` to serve a CDN-cached static shell instantly. `<Dynamic>` boundaries stream per-request content in behind it — no full page reload needed.
  - title: CDN Cache Headers
    details: Export `cdnCache` to emit `Cache-Control`, `CDN-Cache-Control`, and `Surrogate-Control` headers automatically. Works with Cloudflare, Fastly, or any standard CDN.
  - title: Skew Protection
    details: Build ID stamped at compile time (git SHA → Rust FNV-1a hash). Client detects stale JS bundles and hard-reloads automatically — zero stale-bundle errors in production.
  - title: Built-in Analytics
    details: Drop `<Analytics />` into your layout. Real user Core Web Vitals (LCP, CLS, INP, TTFB, FCP) aggregated per route — p75, no third-party scripts, no data leaving your server.
  - title: Safe environment variables
    details: Prefix with `ALAB_PUBLIC_` to expose a variable to the browser. Everything else is server-only — secrets can never be accidentally bundled into client code.
  - title: Built-in dev tools
    details: Floating toolbar in `alab dev` shows the current route, render mode, server/client boundary tree, active params, and layout chain. Zero footprint in production.
  - title: Server-Sent Events
    details: Stream live updates from any API route with `defineSSEHandler`. Subscribe on the client with the `useSSE` hook — reconnects automatically, no WebSocket needed.
  - title: Offline-first mutations
    details: Service worker queues failed server function calls in IndexedDB and replays them on reconnect. `useOfflineMutations` surfaces queue state and manual replay — zero config required.
  - title: Microfrontend-ready
    details: First-class federation via native ESM + import maps — no webpack runtime, no Module Federation. Expose components with `federation.exposes`, consume them with `useFederatedComponent`. React is automatically shared as a singleton across all remotes.
  - title: Monorepo-native
    details: The `--cwd` flag targets any app from the workspace root without changing directories. Works with pnpm workspaces and Turbo out of the box — shared component libraries, shared server functions, and per-app environment variables all work as expected.
---
