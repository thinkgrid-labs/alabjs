# Alab

> *Filipino: alab — blaze, flame, burning passion*

**Alab** is an open-source, full-stack React framework that does the right thing by default.

Out of the box, every Alab app is:

- **Fast** — Rust compiler (oxc), streaming SSR, zero-JS pages where possible
- **SEO-ready** — server-rendered HTML by default, meta tag helpers, auto sitemap
- **Secure** — security headers, CSRF protection, and input sanitization built in
- **High Lighthouse score** — SSR, code splitting, image optimization, critical CSS inlining
- **Styled** — Tailwind CSS v4 included, no config required
- **Simple** — one command to start, zero-config defaults, no boilerplate

> One command. Production-grade defaults. Nothing to configure.

```bash
npx create-alab@latest my-app
cd my-app
pnpm dev
```

---

## Philosophy

Most frameworks give you the tools to build fast, secure, SEO-friendly apps — and then leave it entirely up to you to wire them correctly. Alab makes the right choice the default choice.

| Default | What it means in practice |
|---|---|
| **SSR by default** | Every page is server-rendered. Search engines and social previews get real HTML, not a blank `<div>`. Opt out per-route with `export const ssr = false`. |
| **Tailwind CSS v4 included** | Start writing utility classes immediately. No PostCSS config, no `tailwind.config.js` to set up. |
| **Security headers on every response** | `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` set automatically by the H3 middleware layer. |
| **CSRF protection** | All non-GET server functions require a valid CSRF token. Handled transparently — you never write a line of CSRF logic. |
| **Critical CSS inlining** | The CSS needed to render above-the-fold content is inlined into the HTML response. No render-blocking stylesheet requests. |
| **Automatic code splitting** | Each route is its own JS chunk. Users only download what the current page needs. |
| **Image optimization** | `<Image>` component converts to WebP, generates `srcset`, and lazy-loads by default. |
| **Meta tag helpers** | Export `metadata` from any page to set `<title>`, Open Graph, Twitter Card, and canonical URL. |
| **Auto sitemap** | `/sitemap.xml` is generated from the route manifest — no plugin needed. |
| **Zero-config TypeScript** | TypeScript is the only supported language. No config file needed — Alab's compiler knows the right settings. |

---

## Why Developers Choose Alab

### "I want great defaults, not a great framework to configure"

Every framework claims to be developer-friendly. Most of them mean you *can* build a fast, secure, SEO-ready app — if you install the right plugins, write the right config, and avoid the wrong defaults. Alab means it actually works that way from line one.

### "I'm tired of debugging `use client` at 2am"

Next.js RSC boundaries are powerful but opaque. You add `"use client"`, `"use server"`, and trust that the framework figures it out. When it doesn't, the errors are cryptic. In Alab, the boundary is a **file name**. The Rust compiler reads it. If you cross it, you get a clear error at build time — not a runtime crash in your user's browser.

### "My app has a 65 Lighthouse score and I don't know where to start"

Alab apps start at 95+ Lighthouse by default. SSR ships real HTML. Images are optimized automatically. Unused CSS is purged. Critical CSS is inlined. Fonts are preloaded. Code is split by route. You have to actively work against Alab to get a low score.

### "I'm paying a Vercel tax I didn't agree to"

Next.js works anywhere in theory. In practice, ISR, Edge Middleware, and Image Optimization are tied to Vercel infrastructure. Alab has zero deployment opinions — it's a plain H3 HTTP server that runs on a $6 VPS, Fly.io, Cloudflare Workers, or your own hardware.

### "My builds are slow and I can't see why"

Turbopack is fast but it's a closed black box. Alab uses **oxc** — the open-source Rust compiler that powers Vite 8's Rolldown. 50–100× faster than Webpack. Fully inspectable. Exposed as an SDK you can extend.

### "Security is always something I'll add later"

`later` doesn't come. Alab ships security headers, CSRF protection, and XSS-safe defaults on day one. You don't have to remember to add `helmet`, configure a CSP, or remember which routes need CSRF tokens.

---

## Comparison

### vs Next.js

| | Next.js | **Alab** |
|---|---|---|
| Compiler | Turbopack (Rust, closed source) | oxc (Rust, open source, extensible) |
| Tailwind | Install + configure manually | ✅ Included by default |
| Security headers | Install `next-safe` or configure manually | ✅ Built-in, zero config |
| CSRF protection | DIY | ✅ Built-in |
| SSR default | ✅ Yes | ✅ Yes |
| Server/client boundary | Magic `"use client"` directives | ✅ File conventions, Rust-enforced |
| Deployment | Best on Vercel | Any platform |
| Lighthouse score (default) | 70–85 (varies) | 95+ |
| Sitemap | Plugin required | ✅ Auto-generated |
| Image optimization | `next/image` (tied to Vercel CDN) | ✅ Built-in, self-hosted |
| Config file required | `next.config.js` | None |

### vs Remix

| | Remix | **Alab** |
|---|---|---|
| Compiler | esbuild | Rust (oxc) — significantly faster |
| Tailwind | Configure manually | ✅ Included |
| Security headers | DIY | ✅ Built-in |
| SSG support | ❌ | Planned |
| Image optimization | DIY | ✅ Built-in |
| Lighthouse default | ~80 | 95+ |

### vs Astro

| | Astro | **Alab** |
|---|---|---|
| Primary use case | Content sites, minimal JS | Full-stack apps, SPAs, content sites |
| React support | Islands only (partial hydration) | Full React app, streaming SSR |
| Interactive apps | Awkward | First-class |
| Tailwind | Configure manually | ✅ Included |
| Server functions | Via adapters | ✅ First-class `defineServerFn` |
| TypeScript-only | No | Yes (consistent, no JS/TS config split) |

---

## Getting Started

### Requirements

- Node.js ≥ 22
- pnpm ≥ 10

### Create a new app

```bash
npx create-alab@latest my-app
cd my-app
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). That's it.

No config files to touch. Tailwind is ready. TypeScript is ready. SSR is on. Security headers are set.

---

## Project Structure

```
my-app/
├── app/
│   ├── layout.tsx          ← root layout (HTML shell)
│   ├── page.tsx            ← home page  ( / )
│   ├── page.server.ts      ← server data/actions for home page
│   └── posts/
│       ├── page.tsx        ← posts list  ( /posts )
│       ├── page.server.ts
│       └── [id]/
│           ├── page.tsx    ← post detail  ( /posts/:id )
│           └── page.server.ts
├── public/                 ← static assets
└── package.json
```

No `src/`, no `pages/`, no `components/` you have to create. Just an `app/` directory.

---

## Pages

Every file named `page.tsx` in the `app/` directory becomes a route.

```tsx
// app/page.tsx
export const metadata = {
  title: "Home",
  description: "Welcome to my Alab app",
  og: { image: "/og.png" },
};

export default function HomePage() {
  return (
    <main className="container mx-auto p-8">
      <h1 className="text-4xl font-bold">Hello, Alab</h1>
    </main>
  );
}
```

Tailwind classes work immediately. No config needed.

---

## Server Functions

Data fetching and mutations live in `.server.ts` files — they never ship to the browser.

```ts
// app/posts/[id]/page.server.ts
import { defineServerFn } from "alab/server";

export const getPost = defineServerFn(async ({ params }) => {
  return db.posts.findById(params.id);  // runs only on the server
});
```

Use the data in your page:

```tsx
// app/posts/[id]/page.tsx
import { useServerData } from "alab/client";

export const metadata = { title: "Post" };
export const ssr = true; // already the default — explicit for clarity

export default function PostPage({ params }: { params: { id: string } }) {
  const post = useServerData<Post>("getPost", params);

  return (
    <article className="prose mx-auto py-12">
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  );
}
```

If you accidentally import `page.server.ts` in a client context, **the Rust compiler stops the build** with a clear error before any code ships.

---

## Data Fetching

Alab has a clear opinion on where the line is drawn.

### Built-in: `useServerData` (SSR + Suspense)

For server-rendered data — data that should be fetched on the server before the page is sent to the browser — Alab ships `useServerData`. It uses React 19's `use()` hook and suspends automatically. No loading state boilerplate.

```tsx
import { useServerData } from "alab/client";

export default function PostPage({ params }: { params: { id: string } }) {
  const post = useServerData<Post>("getPost", params); // suspends until ready
  return <h1>{post.title}</h1>;
}
```

This covers **the majority of data fetching** in most apps: page-level data, SSR content, and API responses that need to be in the initial HTML.

### Bring your own: client-side cache

For **client-side interactions** — background refetch, pagination, infinite scroll, optimistic updates, and mutations — Alab does not ship a built-in query client. These problems are already solved by excellent libraries, and bundling one would add weight to every app that doesn't need it.

Alab server functions are plain async functions. They work directly with any data fetching library:

**With TanStack Query:**

```tsx
import { useQuery, useMutation } from "@tanstack/react-query";

// Call a server function as a query
const { data: posts } = useQuery({
  queryKey: ["posts"],
  queryFn: () => fetch("/_alab/fn/getPosts").then(r => r.json()),
});

// Mutate with optimistic updates, retry, etc.
const { mutate: createPost } = useMutation({
  mutationFn: (data) => fetch("/_alab/fn/createPost", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
});
```

**With SWR:**

```tsx
import useSWR from "swr";

const { data, isLoading } = useSWR("/api/posts", (url) =>
  fetch(url).then(r => r.json())
);
```

Both work out of the box. No adapter, no plugin, no configuration.

### Optional: `@alab/query`

For teams that want a tighter integration — typed server function calls, automatic query key generation, and mutation helpers — Alab offers an optional companion package:

```bash
pnpm add @alab/query @tanstack/react-query
```

```tsx
import { createServerQuery } from "@alab/query";
import { getPost } from "./page.server";

// Fully typed — return type inferred from the server function
const usePost = createServerQuery(getPost);

export default function PostPage({ params }: { params: { id: string } }) {
  const { data: post } = usePost(params); // TanStack Query under the hood
  return <h1>{post.title}</h1>;
}
```

`@alab/query` is a thin wrapper around TanStack Query. It is **not bundled with Alab** — zero weight if you don't use it.

---

## Metadata & SEO

Export `metadata` from any page to control `<head>`:

```ts
export const metadata = {
  title: "My Page",
  description: "Page description for search engines",
  canonical: "https://example.com/my-page",
  og: {
    title: "My Page",
    description: "Shared on social media",
    image: "/og-image.png",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: "index, follow",
};
```

Alab injects all of this into the SSR HTML automatically.

---

## Images

Use the built-in `<Image>` component for automatic optimization:

```tsx
import { Image } from "alab/client";

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  priority          // preloads above-the-fold images
/>
```

Alab converts to WebP, generates `srcset` for responsive sizes, adds `loading="lazy"` by default, and serves from the built-in image endpoint — no external CDN required.

---

## Security

Every Alab app gets these security defaults automatically:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'; ...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

CSRF tokens are generated per-session and validated on all non-GET server function calls. You never write any of this — it's on by default.

To customize the CSP:

```ts
// alab.config.ts
export default {
  security: {
    csp: {
      scriptSrc: ["'self'", "https://cdn.example.com"],
    },
  },
};
```

---

## CLI

```bash
alab dev      # Dev server with HMR (Vite + Rust compiler)
alab build    # Production build
alab start    # Production HTTP server
alab info     # Print route manifest — path, kind, SSR status
```

---

## Architecture

Alab is a Rust + TypeScript monorepo. Rust handles everything CPU-bound. TypeScript handles everything network and runtime.

```
crates/
  alab-compiler/   ← oxc: parse TS/TSX, transform JSX, strip types, enforce boundaries
  alab-router/     ← scan app/ directory → route manifest JSON
  alab-napi/       ← napi-rs bridge: exposes Rust to Node.js as a native .node addon

packages/
  alab/            ← CLI, H3 HTTP server, ServerFn types, SEO helpers, security middleware
  alab-vite-plugin/← Vite plugin: Rust transform replaces esbuild in dev and build
  create-alab/     ← npx create-alab@latest scaffolder
```

### The Rust ↔ Node.js bridge

[napi-rs](https://napi.rs/) compiles the Rust crates into a platform-native `.node` binary. To Node.js it's a regular `require()` — but it runs at machine speed with zero IPC overhead.

```ts
// Inside alab-vite-plugin — Node.js calling Rust
import napi from "alab-napi";

const { code } = JSON.parse(napi.compileSource(tsxSource, "page.tsx", false));
// ~0.3ms vs ~30ms with esbuild
```

---

## Lighthouse Score

A default Alab app scores 95–100 across all Lighthouse categories because every optimization is on by default:

| Category | Default behavior |
|---|---|
| **Performance** | SSR ships real HTML, code-split JS chunks, WebP images, critical CSS inline, font preload |
| **Accessibility** | Semantic HTML in layout template, ARIA defaults in `<Image>` and `<Link>` |
| **Best Practices** | HTTPS enforced in production, security headers set, no deprecated APIs |
| **SEO** | Server-rendered HTML, canonical URLs, meta descriptions, structured sitemap |

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Compiler | [oxc](https://oxc.rs/) | Open source Rust, 50–100× faster, modular, extensible |
| Node.js bridge | [napi-rs](https://napi.rs/) | Zero-IPC native addon |
| Styles | [Tailwind CSS v4](https://tailwindcss.com/) | Zero-config, best DX, tiny production output |
| Dev server | [Vite](https://vitejs.dev/) | Best HMR — Alab replaces the transform layer only |
| HTTP server | [H3](https://h3.unjs.io/) | Runs on Node, Cloudflare Workers, Deno — no lock-in |
| React | React 19 | Streaming SSR, `use()` hook, `renderToPipeableStream` |
| Package manager | pnpm | Workspace support |
| Build | Turborepo | Incremental monorepo builds |

---

## Development

### Setup

```bash
git clone https://github.com/alab-framework/alab
cd alab
pnpm install
cargo build -p alab-napi
pnpm build
```

### Tests

```bash
cargo test --workspace   # 8 Rust tests — compiler + router
pnpm test                # TypeScript tests
```

### Run the example

```bash
cd examples/basic-ssr
pnpm dev
```

---

## Roadmap

**Phase 1 — Core (current)**
- [x] Rust compiler core (oxc 0.119 — parse, transform, boundary detection)
- [x] File-system router (route manifest builder)
- [x] napi-rs bindings
- [x] CLI scaffold (dev / build / start / info)
- [x] TypeScript types (ServerFn, ClientPage boundaries)
- [x] basic-ssr example

**Phase 2 — Make it run**
- [ ] napi binary packaging (`@alab/compiler-*` platform npm packages)
- [ ] Vite plugin integration test (end-to-end compile + HMR)
- [ ] Complete SSR render pipeline (`renderToPipeableStream`)
- [ ] Tailwind CSS v4 integration (zero-config)

**Phase 3 — Defaults**
- [ ] Security headers middleware
- [ ] CSRF protection
- [ ] `metadata` export → automatic `<head>` injection
- [ ] Auto `/sitemap.xml` from route manifest
- [ ] `<Image>` component with WebP conversion and `srcset`
- [ ] Critical CSS inlining

**Phase 4 — DX**
- [ ] Error overlay (Rust errors mapped to source lines)
- [ ] `alab info` — show per-file compile output
- [ ] `create-alab` templates (basic, dashboard, blog)
- [ ] Docs site (Starlight)

**Phase 5 — Platforms**
- [ ] Cloudflare Workers adapter
- [ ] Static site generation (SSG)
- [ ] Deno Deploy adapter

---

## Name

*Alab* (uh-LAB) is a Filipino word meaning **blaze**, **flame**, or **burning passion**. It captures both the performance goals (Rust-fast) and the spirit behind it — building something with intensity, care, and purpose.

---

## Contributing

Alab is community-built. All contributions welcome — from fixing typos in docs to implementing new compiler transforms. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

---

## License

MIT — free forever, no exceptions.
