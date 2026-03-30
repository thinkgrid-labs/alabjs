---
title: Introduction
description: What AlabJS is, why it exists, and when to use it.
---

# Introduction

**AlabJS** is an open-source, full-stack React framework built around one principle: the right defaults should be the easy defaults.

Security headers, code splitting, image optimization, and a Rust-powered compiler are on from the first command — not configuration you add later when something breaks in production.

> **New in v0.2** — [Live Components](/live-components): server-rendered HTML fragments delivered over SSE, no client state required. Auto-generated [`AlabRoutes`](/concepts#6-alabroutes-type-safe-navigation) type checked at build time by the Rust route checker.

## The Name

*Alab* (uh-LAB) is a Filipino word meaning **blaze**, **flame**, or **burning passion**. It captures both the performance goal — Rust-fast compilation — and the spirit behind the project: building something with intensity, care, and purpose.

## Why AlabJS Exists

Modern React development has a hidden tax. The tools that promise to make things easier — SSR frameworks, bundlers, image pipelines — each come with their own configuration files, plugin ecosystems, and deployment opinions. By the time you have a production-ready app, you have spent days configuring things that should have just worked.

AlabJS exists because **the right defaults should be the easy defaults**. You should not have to be an expert in bundling, SSR, caching, and security to ship a fast, safe, well-optimized app. That knowledge should live in the framework, not in your config files.

## Philosophy

### Explicit over magic

In AlabJS, clarity is a feature. SSR, caching, and ISR are explicit choices per route — not assumed defaults you have to fight to disable. Server-only code lives in `.server.ts` files, and the Rust compiler enforces that boundary at build time. Cross it and you get a clear error before anything ships. Live components follow the same rule — the component code only ever runs on the server.

### Standards-based and runtime-agnostic

AlabJS is built on web platform standards. The core server is a plain H3 handler that works with `Request` and `Response` objects. Whether the runtime is Node.js, Cloudflare Workers, Deno, or Bun — if it speaks HTTP, AlabJS runs on it without proprietary infrastructure.

### Good performance by default

AlabJS cannot write fast code for you, but it removes the common reasons code is slow by accident. The compiler is built on **oxc** (Rust, open source), which is significantly faster than Webpack-era tools. Code splitting, image lazy-loading, and security headers are active without configuration. SSR, PPR, and CDN caching are available when you need them.

### Developer experience through correctness

A good developer experience is not just hot-reloading. It is a framework that catches mistakes before they reach users. Return types flow from `defineServerFn` directly into React components. The Rust compiler validates every `<RouteLink to>` and `navigate()` call against the route manifest — dead links are build errors, not runtime 404s.

## What Problems It Solves

**Configuration sprawl.** Most React setups require a bundler config, TypeScript config, PostCSS config, Tailwind config, and deployment configuration. AlabJS requires none of them. One command creates a working app.

**Unclear server/client boundaries.** AlabJS uses file naming — `.server.ts` — enforced by the Rust compiler at build time rather than runtime directives you may forget to add.

**Security as an afterthought.** Security headers, CSRF protection, and server-only secret handling are active on every project. There is nothing to configure and nothing to accidentally skip.

**Deployment lock-in.** The server is a plain H3 HTTP handler. It runs on Node.js, Cloudflare Workers, and Deno Deploy without modification. Switching hosts does not require rewriting your application.

**Slow builds at scale.** AlabJS uses oxc — the same Rust-based parser and transformer powering Vite 8's Rolldown — for compilation. Build times are substantially faster than Webpack-era setups; the exact improvement depends on project size.

## Default Behaviors

AlabJS ships with sensible defaults. Each can be changed; none require configuration to enable.

| Default | What it does |
|---|---|
| **CSR by default, SSR opt-in** | Pages render on the client unless you add `export const ssr = true`. This keeps client-only apps fast without a server round-trip. |
| **Security headers** | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` set on every response. |
| **CSRF protection** | Non-GET server function calls require a valid token automatically. |
| **Tailwind CSS v4** | Write utility classes from the start. No PostCSS or Tailwind config file needed. |
| **Code splitting** | Each route is its own JS chunk. Users download only the code for the page they visit. |
| **Image optimization** | `<Image>` converts to WebP, generates `srcset`, lazy-loads. Powered by the Rust binary. |
| **Auto sitemap** | `/sitemap.xml` generated from the route manifest. No plugin or manual list. |
| **Live components** | `*.live.tsx` files stream updated HTML over SSE. Server renders; browser patches the DOM. |
| **Type-safe routes** | `AlabRoutes` union auto-generated at build time. Unknown paths fail the build. |

## When to Use AlabJS

AlabJS is a good fit for:

- **Full-stack React apps** that need API routes, server functions, and a database layer
- **Content sites and blogs** where SSR and good Lighthouse scores matter
- **SPAs** that want a clean build pipeline without a custom Vite config
- **Apps with security requirements** — headers, CSRF, and server/client boundary enforcement are active by default
- **Real-time dashboards** that need server-pushed updates without a WebSocket server or client polling loop
- **Teams migrating from other frameworks** who want typed server functions without managing `"use client"` and `"use server"` directives by hand

AlabJS is probably not the right choice if you need React Server Components (RSC), an Edge-optimised runtime (Vercel Edge, AWS Lambda@Edge), or a GraphQL API layer — these are on the [roadmap](/roadmap) but not available yet.

## TypeScript Only

AlabJS does not support plain JavaScript.

This is a deliberate choice. Server function return types flow into client components through `import type`. The Rust compiler uses TypeScript's syntax to enforce server/client boundaries and strip dead code from the browser bundle. The `AlabRoutes` union type is generated from the route manifest. None of these work without TypeScript.

If you are migrating a JavaScript project, rename your files to `.ts` and `.tsx`. The compiler handles the rest.

Adding `.alabjs/routes.d.ts` to your `tsconfig.json` `include` array enables type checking on `<RouteLink to>`, `<Link href>`, and `navigate()` calls:

```json
{
  "include": ["app", ".alabjs/routes.d.ts"]
}
```

## Tech Stack

| Layer | Technology |
|---|---|
| Compiler | oxc (Rust) via napi-rs |
| Bundler | Vite 8 + Rolldown |
| HTTP server | H3 |
| React | React 19 |
| Styles | Tailwind CSS v4 |
| Testing | Vitest |
| Package manager | pnpm |
