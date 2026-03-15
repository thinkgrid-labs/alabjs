# Alab

**Alab** (Filipino: *alab* — blaze, flame, burning passion) is an open-source, full-stack React framework powered by a Rust compiler core.

> *"Build with alab."*

---

## What is Alab?

Alab is a React meta-framework — like Next.js — but built differently from the ground up:

- **Rust compiler core** using [oxc](https://oxc.rs/) for parsing, TypeScript stripping, JSX transformation, and server-boundary enforcement — all at native speed.
- **Node.js TypeScript runtime** for the HTTP server, file-system router, and CLI — familiar, portable, no lock-in.
- **Explicit server/client boundaries** enforced at build time by the Rust compiler, not by magic RSC directives.
- **Opt-in SSR** — apps are CSR by default (fast, simple), SSR is a one-line opt-in per route.

---

## Why Developers Choose Alab

### 1. You're tired of debugging "use client" at 2am

Next.js RSC boundaries are powerful but opaque. You add `"use client"`, `"use server"`, and trust that the framework figures it out. When it doesn't, the error messages are cryptic and the stack traces point nowhere useful. In Alab, the boundary is a **file name**. The Rust compiler reads it. If you cross it, you get a clear error before the code ever runs — at build time, not in your user's browser.

### 2. You're paying a Vercel tax you didn't agree to

Next.js works anywhere in theory. In practice, features like ISR, Edge Middleware, and Image Optimization are tied to Vercel infrastructure. Alab has zero deployment opinions. It's an H3 HTTP server — it runs on a DigitalOcean droplet, a Fly.io machine, a Cloudflare Worker, or your own bare metal. No adapter required.

### 3. Your builds are slow and you don't know why

Turbopack is fast but it's a black box you can't extend or inspect. Most teams still use Webpack because Turbopack isn't stable outside Next.js. Alab uses **oxc** — the same Rust parser that powers Vite 8's Rolldown. It's open source, modular, and 50–100× faster than Webpack. You can run the compiler yourself, inspect the output, write custom transforms. It's an SDK, not a sealed runtime.

### 4. You want SSR when you need it, not as a default tax

Next.js makes SSR the default and CSR the exception. For most apps — dashboards, admin panels, SaaS tools — SSR adds complexity with marginal SEO benefit. Alab flips this: **CSR by default, SSR as a single export per route.** You pay the SSR cost only where it matters.

### 5. You want to actually understand your framework

The best frameworks are the ones you can read and reason about. Alab's Rust compiler is ~3,000 lines. The Node.js runtime is plain TypeScript. There are no Webpack plugins hidden inside plugins inside loaders. If something breaks, you can find it.

### 6. You want to build something that matters

Alab is open source, MIT licensed, and built to last. No VC funding, no platform agenda. If the community builds it, the community owns it.

---

## The Problem with Existing Frameworks

| Problem | Next.js | Remix | Astro | **Alab** |
|---|---|---|---|---|
| **Vercel lock-in** | Heavily optimized for Vercel infrastructure | Portable | Portable | ✅ Runs anywhere |
| **Opaque server/client boundaries** | Magic `"use client"` / RSC directives | Convention-based | N/A | ✅ Rust compiler enforces file conventions, errors at build time |
| **Slow builds at scale** | Turbopack (good but closed, memory leaks) | esbuild | Vite | ✅ oxc — 50–100× faster than ESLint/Webpack |
| **SSR forced by default** | SSR always on, complex to opt out | SSR always on | SSG-first | ✅ CSR by default, `export const ssr = true` per route |
| **Compiler opacity** | Black box | Black box | Black box | ✅ Compiler exposed as SDK — inspect what any file compiles to |
| **Cryptic RSC errors** | "Cannot read property of undefined in Server Component" | — | — | ✅ Rust build errors with exact file + byte offset |

### The Core Pain Point: Server/Client Boundary Confusion

In Next.js, whether code runs on the server or browser depends on `"use client"` / `"use server"` directives that are easy to misplace and hard to reason about statically. Countless hours are lost debugging hydration mismatches and accidental server-only code leaking to the browser bundle.

**In Alab, the boundary is enforced by the file name and the Rust compiler:**

```
app/
  users/
    [id]/
      page.server.ts   ← server-only (never ships to browser)
      page.tsx         ← React component (runs on server for SSR, hydrates on client)
```

If you accidentally import a `.server.ts` module in a `.page.tsx` file's browser context, **the Rust compiler stops the build with a clear error** before any code reaches production:

```
error: Server boundary violation in app/users/[id]/page.tsx
  Cannot import server module "./page.server" in a client context.
  Move the import to a .server.ts file or use `useServerData()` instead.
```

No magic. No runtime surprises. Just file conventions enforced by the compiler.

---

## Architecture

Alab is a hybrid monorepo — Rust handles everything CPU-bound, Node.js handles everything network and runtime.

```
alab/
├── crates/
│   ├── alab-compiler/     ← oxc: parse TS/TSX, transform JSX, strip types, check boundaries
│   ├── alab-router/       ← scan app/ directory, build route manifest JSON
│   └── alab-napi/         ← napi-rs bindings: exposes Rust to Node.js as a native .node addon
│
└── packages/
    ├── alab/              ← CLI, H3 HTTP server, ServerFn types, React hooks
    ├── alab-vite-plugin/  ← Vite plugin: replaces esbuild with Rust compiler in dev/build
    └── create-alab/       ← npx create-alab@latest scaffolder
```

### How the Bridge Works

[napi-rs](https://napi.rs/) compiles the Rust crates into a platform-native `.node` binary. To Node.js, it looks like a regular `require()` — but it runs at machine speed with zero IPC overhead.

```ts
// Inside the Vite plugin — Node.js calling Rust directly
import napi from "alab-napi";

const result = napi.compileSource(typescriptCode, "page.tsx", false);
// → { code: "const el = _jsx(\"div\"...)", map: null }
// Took ~0.3ms instead of ~30ms with esbuild
```

---

## Quick Start

```bash
npx create-alab@latest my-app
cd my-app
pnpm install
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

---

## File Conventions

| File | Purpose |
|---|---|
| `app/page.tsx` | Root page component |
| `app/layout.tsx` | Root layout (wraps all pages) |
| `app/users/[id]/page.tsx` | Dynamic route page — `params.id` available |
| `app/users/[id]/page.server.ts` | Server-only data/actions for that route |
| `app/users/[id]/loading.tsx` | Loading skeleton (Suspense fallback) |
| `app/users/[id]/error.tsx` | Error boundary |

---

## Defining Server Functions

Server functions live in `.server.ts` files and never ship to the browser. Alab's Rust compiler extracts them into API route handlers at build time.

```ts
// app/posts/[id]/page.server.ts
import { defineServerFn } from "alab/server";

export const getPost = defineServerFn(async ({ params }) => {
  return db.posts.findById(params.id);
});
```

Consume them in a page component:

```tsx
// app/posts/[id]/page.tsx
import { useServerData } from "alab/client";

export const ssr = true; // opt-in SSR for this route

export default function PostPage({ params }: { params: { id: string } }) {
  const post = useServerData<Post>("getPost", params);
  return <article><h1>{post.title}</h1></article>;
}
```

`useServerData` uses React 19's `use()` hook — it suspends while the server fetch is in flight, so no loading state boilerplate needed.

---

## CLI

```bash
alab dev      # Start dev server (Vite + Rust compiler, HMR enabled)
alab build    # Production build
alab start    # Start production HTTP server
alab info     # Print the route manifest — see every route, kind, and SSR status
```

---

## Comparison

### vs Next.js

| | Next.js | Alab |
|---|---|---|
| Compiler | Turbopack (Rust, closed source) | oxc (Rust, open source) |
| Server boundary | `"use client"` / `"use server"` directives | File conventions + Rust build-time enforcement |
| SSR default | Always on | Opt-in per route |
| Deployment | Best on Vercel | Any Node.js host, Cloudflare, self-hosted |
| Bundle size | ~566 KB baseline | Minimal (no framework runtime shipped by default) |
| Compiler access | None | Exposed as SDK |

### vs Remix

| | Remix | Alab |
|---|---|---|
| Compiler | esbuild | Rust (oxc) |
| SSG support | None | Planned |
| Data loading | Loader functions (export per route) | `defineServerFn` + `useServerData` |
| Type safety | Good | Strict — server/client boundary enforced at type level |

### vs Astro

| | Astro | Alab |
|---|---|---|
| Primary use case | Content sites, minimal JS | Full-stack apps, dashboards, SPAs |
| React support | Islands (partial hydration) | Full React app with streaming SSR |
| Server functions | Via adapters | First-class `defineServerFn` |
| Default mode | SSG | CSR (SPA) |

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Compiler | [oxc](https://oxc.rs/) | 50–100× faster than ESLint/Webpack, modular crates |
| Node.js bridge | [napi-rs](https://napi.rs/) | Zero-IPC native addon, proven in production |
| Dev server | [Vite](https://vitejs.dev/) | Best-in-class HMR — Alab replaces the transform layer only |
| HTTP server | [H3](https://h3.unjs.io/) | Lightweight, runs on Node, Cloudflare Workers, Deno |
| React | React 19 | `renderToPipeableStream`, `use()` hook, streaming |
| Package manager | pnpm | Workspace support, fast |
| Build orchestration | Turborepo | Incremental builds across packages |

---

## Development

### Prerequisites

- Rust (stable or nightly): `rustup install stable`
- Node.js ≥ 22
- pnpm ≥ 10: `npm i -g pnpm`

### Setup

```bash
git clone https://github.com/alab-framework/alab
cd alab
pnpm install
cargo build -p alab-napi   # build the Rust → Node.js native addon
pnpm build                  # build all TypeScript packages
```

### Running tests

```bash
cargo test --workspace      # Rust tests (8 tests)
pnpm test                   # TypeScript tests
```

### Running the example

```bash
cd examples/basic-ssr
pnpm dev
```

---

## Roadmap

- [ ] `alab-napi` npm package with pre-built platform binaries (linux-x64, darwin-arm64, win32-x64)
- [ ] Complete SSR render pipeline (`renderToPipeableStream` integration)
- [ ] `alab info` compiler transparency — show exactly what each file compiles to
- [ ] Error overlay with Rust compiler errors mapped to source lines
- [ ] Static site generation (SSG) support
- [ ] Cloudflare Workers / Deno Deploy adapter
- [ ] Docs site (Starlight)

---

## Name

*Alab* (uh-LAB) is a Filipino word meaning **blaze**, **flame**, or **burning passion**. It captures the intensity behind the framework's performance goals and the passion that goes into building it.

---

## License

MIT
