---
title: Roadmap
description: What has shipped, what is in progress, and what is coming next for AlabJS.
---

# Roadmap

This page tracks what has shipped, what is actively being worked on, and what is planned. It is updated with each release.

> Items marked **In Progress** are being built now. Items marked **Planned** are committed but not yet started. Items marked **Exploring** are ideas being evaluated — they may change or be dropped.

---

## ✅ Shipped

### v0.1 t0 v0.3 — Foundation

The core framework. Everything you need to build a production-grade full-stack React app.

- **File-system routing** — `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, dynamic `[param]` segments, catch-all `[...slug]`
- **CSR / SSR / PPR** — client-side rendering by default; opt-in SSR per route; partial prerendering with static shell + streaming dynamic sections
- **Server functions** — `defineServerFn` in `.server.ts` files, type-safe end-to-end, CSRF protected
- **Data fetching** — `useServerData` hook with React Suspense integration
- **Mutations** — `useMutation` with optimistic updates, Zod validation, offline queuing
- **API routes** — `route.ts` with `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` exports
- **Middleware** — `middleware.ts` with optional path matcher
- **Image optimization** — WebP conversion, responsive `srcset`, blur-up placeholders, lazy loading
- **`<Link>` component** — SPA navigation, prefetch on hover, scroll restoration
- **`<Script>` component** — `beforeInteractive`, `afterInteractive`, `lazyOnload` strategies
- **CDN cache headers** — `cdnCache` export, `revalidateTag`, `revalidatePath`, Cloudflare / Fastly / generic support
- **ISR** — `revalidate` export with stale-while-revalidate semantics
- **Skew protection** — build ID stamping (git SHA → FNV-1a → timestamp fallback), automatic hard reload on mismatch
- **Analytics** — zero-dependency Core Web Vitals per route, in-memory ring buffer, no third-party scripts
- **Offline mutations** — service worker queues failed mutations in IndexedDB, Background Sync replay
- **Signals** — `signal()`, `computed()`, `effect()`, `useSignalValue()` for fine-grained reactivity
- **Server-Sent Events** — `defineSSEHandler` + `useSSE` hook for streaming real-time events
- **i18n routing** — `createI18nConfig`, locale-prefixed routes, `LocaleLink`, `detectLocale`
- **Microfrontends** — native ESM + import maps federation, shared React singleton, `useFederatedComponent`
- **Dev tools** — floating toolbar with route info, render mode, params, server/client boundaries tree
- **Monorepo support** — `--cwd` / `-C` flag, pnpm workspaces, Turbo orchestration guide
- **Deployment adapters** — Node.js, Bun, Cloudflare Workers, Deno Deploy, Fly.io, Railway

### v0.4 — Live & Type-Safe Routing

Real-time server-rendered components and compile-time route safety.

- **Live components** — `*.live.tsx` convention and `"use live"` directive; server renders HTML fragments pushed over SSE; no client-side state or polling
- **`liveInterval`** — time-based server push (minimum 1 second)
- **`liveTags` + `invalidateLive`** — tag-based push from any server route or server function
- **SSR hydration for live components** — `suppressHydrationWarning` + `generateLiveServerWrapper` eliminates hydration mismatch on SSR pages
- **`event: error` handling** — server render errors shown inline, SSE connection preserved for recovery
- **AlabRoutes type union** — auto-generated `AlabRoutes` from route manifest, written to `.alabjs/routes.d.ts`
- **Typed `navigate` and `<RouteLink>`** — `declare module "alabjs/router"` and `declare module "alabjs/components"` overloads
- **Rust route reference checker** — `checkRouteRefs` validates every `<RouteLink to>`, `<Link href>`, and `navigate()` string literal against the manifest at build time; reports file, offset, and typo suggestion
- **Build type-check order fix** — `routes.d.ts` guaranteed to exist before `tsc --noEmit` runs
- **Dev watch mode for route types** — `.alabjs/routes.d.ts` re-emitted when route files are added or removed, no restart needed
- **`live-dashboard` example** — stock ticker grid + alerts feed demonstrating `liveInterval`, `liveTags`, and `invalidateLive`

---

## 🔨 In Progress

### v0.5 — Live Broadcast + DX Polish

- **Redis broadcaster for live components** — currently live updates are in-process only; multi-instance deployments need a shared channel. An optional `@alabjs/broadcaster-redis` package will expose a `redisBroadcaster` adapter plugged in via `alabjs.config.ts`. [Tracked in `broadcaster.ts`.]
- **Live component authentication** — forward session cookies / auth headers to the SSE renderer so live components can call `defineServerFn` with the current user's context
- **Dev overlay for live connections** — the dev tools toolbar will show active SSE connections, last push time, and error state per live component
- **`alab info` live manifest output** — extend the CLI command to list live components alongside pages and API routes

---

## 📋 Planned

### v0.6 — Database & Forms

- **First-class Drizzle ORM integration** — zero-config schema discovery, type-safe query helpers available in server functions
- **Form actions** — `<form action={serverFn}>` progressive enhancement without JavaScript; pairs with `useMutation` for the enhanced path
- **Server-side validation errors surfaced to forms** — structured error response from `defineServerFn` Zod schemas automatically maps to form field errors via `useFormErrors`
- **`<FormStatus>` component** — pending/success/error state for the nearest parent `<form action>`

### v0.7 — Observability & Testing

- **Distributed tracing** — OpenTelemetry spans for SSR render time, server function duration, and live component push latency; exportable to Jaeger, Honeycomb, Datadog
- **`renderLive` test utility** — test helper that renders a live component server-side, captures the HTML output, and asserts on it without a running SSE connection
- **`mockInvalidateLive`** — test helper that intercepts `invalidateLive` calls and records which tags were pushed
- **Storybook adapter** — render AlabJS components in Storybook without a running server

### v0.8 — Edge & Platform

- **Vercel adapter** — output Edge Functions + ISR via the Build Output API
- **AWS Lambda adapter** — deploy to Lambda + CloudFront without a persistent server
- **Bun native file serving** — use `Bun.file` for static assets in `alab start` instead of the Node.js `fs` path; ~2× throughput on Bun deployments

---

## 🔭 Exploring

These are ideas under active evaluation. They are not committed.

- **React Server Components (RSC)** — AlabJS currently uses a different server-rendering model (server functions + SSR). RSC is being evaluated for a future major version. The main constraint is the dual-bundle complexity and the interaction with live components.
- **`alab studio`** — a local GUI for the route manifest, live connection monitor, analytics dashboard, and build analyser; replaces the floating dev toolbar with a full-page experience
- **Plugin API** — a stable `defineAlabPlugin` interface so the community can extend the framework (custom route kinds, new build steps, deployment adapters) without forking
- **`alab generate`** — scaffolding CLI for pages, server functions, live components, and route handlers with AlabJS conventions pre-applied
- **WebSocket support** — `defineWSHandler` alongside the existing `defineSSEHandler`; SSE covers most real-time read use cases but WebSockets are needed for bidirectional communication

---

## Not Planned

These are features that have been considered and deliberately excluded from the roadmap.

| Feature | Why |
|---|---|
| Plain JavaScript support | TypeScript is required for the Rust compiler's boundary enforcement and `AlabRoutes` generation. JS support would remove both guarantees. |
| React Native / Expo | AlabJS is a web framework. The server and routing model do not map to native. |
| GraphQL layer | GraphQL adds schema-stitching complexity that server functions already solve more simply. Third-party integration is straightforward. |
| Built-in CMS | Out of scope. AlabJS integrates cleanly with any headless CMS via server functions. |
| Custom bundler configuration | Zero-config is a first-class design goal. Advanced bundler needs should be solved by the framework, not pushed to the user. |

---

## Contributing

The roadmap is open. If you want to work on something listed here, open an issue on GitHub before starting — particularly for items marked **Planned** or **Exploring** — so work is not duplicated.

Bug reports, documentation improvements, and example apps are always welcome without prior discussion.
