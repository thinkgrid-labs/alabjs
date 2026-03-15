# AlabJS

> *Filipino: alab — blaze, flame, burning passion*

> [!WARNING]
> **AlabJS is under active development and not yet production-ready.**
> APIs may change before v1.0. Feel free to explore, contribute, or star the repo.

**AlabJS** is an open-source, full-stack React framework built for developers who want great results without wrestling their tools. It ships production-grade defaults — a Rust compiler, streaming SSR, security headers, image optimization, and Tailwind CSS — so you spend your time building features, not configuring pipelines.

---

## The Name

*Alab* (uh-LAB) is a Filipino word meaning **blaze**, **flame**, or **burning passion**. It captures both the performance goal — Rust-fast compilation — and the spirit behind the project: building something with intensity, care, and purpose.

---

## Why Alab Exists

Modern React development has a hidden tax. The tools that promise to make things easier — SSR frameworks, bundlers, image pipelines — each come with their own configuration files, plugin ecosystems, and deployment opinions. By the time you have a production-ready app, you have spent days configuring things that should have just worked.

At the same time, the performance bar keeps rising. Users expect instant page loads, perfect Lighthouse scores, and offline capability. Developers are expected to know when to SSR, when to CSR, how to split bundles, when to cache, and how to stay secure — and to get all of it right, every time.

AlabJS exists because **the right defaults should be the easy defaults**. You should not have to be an expert in bundling, SSR, caching, and security to ship a fast, safe, well-optimized app. That knowledge should live in the framework.

---

## Philosophy

AlabJS doesn't aim to compete with established frameworks on feature count alone. Instead, it competes on **philosophy**.

### 1. Explicit over Magic
In Alab, clarity is a feature. We avoid "invisible magic" that makes debugging a nightmare.
- **Opt-in Features**: SSR, caching, and ISR are explicit choices per route, not assumed defaults that you have to fight to disable.
- **Clear Boundaries**: Server-only code lives in `.server.ts` files. This isn't just a convention; the Rust compiler enforces this boundary at build time, preventing accidental leaks of server logic to the client.

### 2. Standarized & Runtime Agnostic
Alab is built on web standards. The core server is a standard H3 handler that works with `Request` and `Response` objects.
- **Deploy Anywhere**: Whether it's Node.js, Cloudflare Workers, Deno, or Bun—if it speaks HTTP, Alab runs on it.
- **No Lock-in**: We don't build features that require proprietary infrastructure. You own your server.

### 3. Performance as a Baseline
Most frameworks give you the tools to be fast; Alab makes fast the only option.
- **Rust-Powered**: Our compiler is built on **oxc**, making it 50-100x faster than legacy tools.
- **Production-Grade Defaults**: Streaming SSR, image optimization, and security headers are active from the first byte.

### 4. Developer Joy through Correctness
We believe that a "great DX" isn't just about hot-reloading (though we're fast at that too). It's about a framework that catches your mistakes before they reach the user.
- **End-to-End Type Safety**: Types flow from your `defineServerFn` directly into your React components without manual sync.
- **Compiler-Enforced Safety**: The Rust compiler validates your architecture as you build, turning runtime "surprises" into build-time "to-dos".

---

## What Problem It Solves

**Configuration sprawl.** Most React setups require a bundler config, a TypeScript config, a PostCSS config, a Tailwind config, and deployment configuration on top. Alab has zero required config files. One command creates a working app.

**Unclear server/client boundaries.** Magic directives create invisible walls in your component tree. Alab uses file naming — `.server.ts` — enforced by the Rust compiler at build time. Cross the boundary and you get a clear error before anything ships.

**Performance as an afterthought.** Most frameworks give you the tools to be fast. Alab makes fast the default: SSR on, code splitting on, image optimization on, security headers on. You opt out if you don't need it — not opt in.

**Deployment lock-in.** Building on a framework should not mean committing to a specific cloud provider. Alab runs on any Node.js host, Cloudflare Workers, or Deno Deploy — the server is a plain H3 HTTP handler you own entirely.

**Slow builds at scale.** Alab uses an oxc-based Rust compiler — the same technology powering Vite 8's Rolldown. Compilation is 50–100× faster than Webpack-era tools.

---

## Features

### Core

- **Rust compiler (oxc)** — 50–100× faster than Webpack, open source, extensible
- **File-system router** — `app/` directory, nested layouts, dynamic segments
- **Streaming SSR** — `renderToPipeableStream`, real HTML in the first byte, no blank pages
- **CSR by default, SSR opt-in** — `export const ssr = true` on any page
- **Auto layout composition** — `layout.tsx` files nest automatically, root to leaf
- **SPA client navigation** — `<Link>` swaps content without a full page reload, prefetches on hover
- **Error boundaries** — `error.tsx` files catch render errors per-route with retry support
- **Loading UI** — `loading.tsx` files render Suspense fallbacks while data loads
- **Not-found page** — `not-found.tsx` handles unmatched routes with HTTP 404

### Data

- **Server functions** — `defineServerFn` runs only on the server; the Rust compiler enforces the boundary
- **`useServerData`** — Suspense-powered data fetching, full type inference from the server function
- **`useMutation`** — async state machine (idle → pending → success / error / invalid) with optimistic updates
- **Explicit caching** — `{ cache: { ttl, tags } }` on any server function; nothing cached without your say-so
- **Zod validation** — `defineServerFn(schema, handler)` validates input and returns HTTP 422 with structured errors
- **ISR** — `export const revalidate = 60` caches rendered HTML with stale-while-revalidate background regeneration
- **API routes** — `route.ts` exports `GET`, `POST`, `PUT`, `PATCH`, `DELETE` as standard `Request → Response` handlers
- **Server-Sent Events** — `defineSSEHandler` streams live updates; `useSSE` subscribes on the client

### SEO & Metadata

- **Static metadata** — `export const metadata` sets title, description, OG tags, Twitter Card
- **Dynamic metadata** — `export async function generateMetadata(params)` for per-route values
- **`generateStaticParams`** — pre-render dynamic routes at build time with explicit param lists
- **Auto sitemap** — `/sitemap.xml` generated from the route manifest automatically

### UI & Styling

- **Tailwind CSS v4** — zero-config, no PostCSS setup, auto-detects classes in source files
- **`<Image>`** — Rust WebP conversion, `srcset`, blur-up placeholder, lazy loading by default
- **`<Link>`** — SPA navigation, hover prefetch, `history.pushState`
- **`<Script>`** — third-party script loading with `beforeInteractive | afterInteractive | lazyOnload`
- **`<Font>`** — Google Fonts with preconnect and `font-display: swap`
- **`<ErrorBoundary>`** — client-side error boundary with custom fallback prop

### Routing

- **File-system router** — automatic, convention-based, zero config
- **Code-based router** — opt-in typed router (`createRoute`, `createRouter`, `RouteLink`) with inferred param and search types
- **i18n routing** — `createI18nConfig`, URL prefix detection, `LocaleProvider`, `useLocale`, `LocaleLink`
- **Middleware** — `middleware.ts` at project root with `redirect()` and `next()` helpers, path matchers

### Security

- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` on every response
- **CSRF protection** — Double Submit Cookie pattern, completely transparent
- **Server boundary enforcement** — Rust compiler rejects any import of `.server.ts` in a client context

### Developer Experience

- **Dev boundary overlay** — `Alt+Shift+B` shows SSR/CSR status, route file, layout chain, cache status
- **Error overlay** — Rust compiler errors mapped to exact source lines in the browser
- **Build-time type checking** — `tsc --noEmit` runs in parallel with the Vite 8 build
- **Bundle analyzer** — `alab build --analyze` opens an interactive Rolldown treemap
- **Zero-config testing** — `alab test` with Vitest; `alab/test` exports `renderPage` and `renderComponent` helpers

### Deployment

- **Node.js / Docker** — `alab start` runs the H3 production server
- **Cloudflare Workers** — `alab/adapters/cloudflare`
- **Deno Deploy** — `alab/adapters/deno`
- **Web standard** — `alab/adapters/web` for any fetch-based runtime
- **SPA mode** — `alab build --mode spa` for CDN-deployable client-only builds
- **Static site generation** — `alab ssg` pre-renders static routes to HTML files

### Offline & Local-First

- **Offline mutation queue** — service worker queues failed POSTs in IndexedDB, replays on reconnect
- **`useOfflineMutations`** — observe queue count, trigger replay, render offline banners
- **`@alab/sync`** — local-first sync adapters for PGlite, ElectricSQL, and PowerSync

### Reactivity

- **`signal(initial)`** — observable value, defined at module scope, no React tree required
- **`useSignal(sig)`** — subscribe and write; only the reading component re-renders
- **`computed(sources, derive)`** — derived signal, auto-updates when any source changes

---

## Advantages

**TypeScript-only by design.** Every file is TypeScript. Server function return types flow directly into client components — no manual annotation, no guesswork. The Rust compiler depends on it, and so does end-to-end type safety.

**Explicit over magic.** Caching is opt-in. SSR is opt-in. Server functions have explicit file names. Nothing happens behind your back. When something goes wrong, you know exactly where to look.

**Deployable anywhere.** The production server is a plain H3 handler. Any runtime that speaks HTTP can run it. No proprietary infrastructure required.

**Open compiler.** oxc is open source, documented, and extensible. The Rust compilation pipeline is inspectable via `alab info`. You can write your own transforms.

**95+ Lighthouse by default.** SSR, code splitting, image optimization, and security headers are all active from the first line. You would have to actively disable features to score lower.

**Grows with you.** Start with the file-system router and server functions. Add the code-based router when the project scales. Add `@alab/sync` for offline-first. Every capability is additive — the simple baseline never changes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Compiler | oxc (Rust, open source) via napi-rs |
| Bundler | Vite 8 + Rolldown (Rust-native) |
| HTTP server | H3 (Node, Cloudflare Workers, Deno) |
| React | React 19 (streaming SSR, `use()`, concurrent mode) |
| Styles | Tailwind CSS v4 (zero-config) |
| Testing | Vitest (jsdom + node environments) |
| Package manager | pnpm workspaces |

---

## Get Started

```bash
npx create-alab@latest my-app
cd my-app
pnpm dev
```

Full documentation lives in the [`docs/`](./docs/src/content/docs/) folder.

---

## Contributing

All contributions welcome — docs, bug fixes, new features, and examples. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

---

## License

MIT — free forever.
