---
title: Introduction
description: What AlabJS is, why it exists, and when to use it.
---

# Introduction

**AlabJS** is an open-source, full-stack React framework designed around one idea: the right defaults should be the easy defaults.

Every AlabJS app starts at 95+ Lighthouse, has security headers set, streams real HTML from the server, and compiles with a Rust-powered compiler — without writing a single line of configuration.

## The Name

*Alab* (uh-LAB) is a Filipino word meaning **blaze**, **flame**, or **burning passion**. It captures both the performance goal — Rust-fast compilation — and the spirit behind the project: building something with intensity, care, and purpose.

## Why AlabJS Exists

Modern React development has a hidden tax. The tools that promise to make things easier — SSR frameworks, bundlers, image pipelines — each come with their own configuration files, plugin ecosystems, and deployment opinions. By the time you have a production-ready app, you have spent days configuring things that should have just worked.

At the same time, the performance bar keeps rising. Users expect instant page loads, perfect Lighthouse scores, and offline capability. Developers are expected to know when to SSR, when to CSR, how to split bundles, when to cache, and how to stay secure — and to get all of it right, every time.

AlabJS exists because **the right defaults should be the easy defaults**. You should not have to be an expert in bundling, SSR, caching, and security to ship a fast, safe, well-optimized app. That knowledge should live in the framework.

## Philosophy

### Explicit over magic

In AlabJS, clarity is a feature. SSR, caching, and ISR are explicit choices per route — not assumed defaults you have to fight to disable. Server-only code lives in `.server.ts` files, and the Rust compiler enforces that boundary at build time. Cross it and you get a clear error before anything ships.

### Standardized and runtime-agnostic

AlabJS is built on web standards. The core server is a plain H3 handler that works with `Request` and `Response` objects. Whether it's Node.js, Cloudflare Workers, Deno, or Bun — if it speaks HTTP, AlabJS runs on it. No proprietary infrastructure required.

### Performance as a baseline

Most frameworks give you the tools to be fast. AlabJS makes fast the only option. The compiler is built on **oxc** (Rust, open source), making it 50–100× faster than legacy tools. Streaming SSR, image optimization, and security headers are active from the first byte — not optional plugins.

### Developer joy through correctness

A great developer experience isn't just hot-reloading. It's a framework that catches your mistakes before they reach the user. Types flow from `defineServerFn` directly into React components without manual sync. The Rust compiler validates your architecture as you build, turning runtime surprises into build-time to-dos.

## What Problem It Solves

**Configuration sprawl.** Most React setups require a bundler config, a TypeScript config, a PostCSS config, a Tailwind config, and deployment configuration on top. AlabJS has zero required config files. One command creates a working app.

**Unclear server/client boundaries.** Magic directives create invisible walls in your component tree. AlabJS uses file naming — `.server.ts` — enforced by the Rust compiler at build time.

**Performance as an afterthought.** Most frameworks give you the tools to be fast. AlabJS makes fast the default: SSR on, code splitting on, image optimization on, security headers on. You opt out if you don't need it — not opt in.

**Deployment lock-in.** Building on a framework should not mean committing to a specific cloud provider. AlabJS runs on any Node.js host, Cloudflare Workers, or Deno Deploy — the server is a plain H3 HTTP handler you own entirely.

**Slow builds at scale.** AlabJS uses an oxc-based Rust compiler — the same technology powering Vite 8's Rolldown. Compilation is 50–100× faster than Webpack-era tools.

## Default Behaviors

AlabJS makes the correct choice by default. You opt out of behaviors you don't need — not opt in to the ones you do.

| Default behavior | What it means |
|---|---|
| CSR by default, SSR opt-in | Pages render on the client unless you add `export const ssr = true`. Opt-in SSR keeps client pages fast for interactive apps. |
| Security headers on every response | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` — set automatically. |
| CSRF protection | All non-GET server function calls require a valid token. Zero configuration. |
| Tailwind CSS v4 included | Start writing utility classes. No PostCSS, no Tailwind config. |
| Code splitting | Each route is its own JS chunk. Users only download what they need. |
| Image optimization | `<Image>` converts to WebP, generates `srcset`, lazy-loads by default. |
| Auto sitemap | `/sitemap.xml` is generated from the route manifest. No plugin needed. |

## When to Use AlabJS

AlabJS is a great fit for:

- **Full-stack React apps** that need server-rendered pages, API routes, and a database
- **Content sites and blogs** that need SEO, fast loads, and a great Lighthouse score
- **SPAs** that want a clean build pipeline without custom Vite config
- **Apps with strict security requirements** that need headers, CSRF, and boundary enforcement
- **Teams migrating from other frameworks** who want typed server functions without `"use client"` magic

## TypeScript Only

AlabJS does not support plain JavaScript. Every file in an AlabJS project is TypeScript.

This is a deliberate design choice, not a limitation. Server function return types flow directly into client components through `import type`. The Rust compiler uses TypeScript's syntax to enforce server/client boundaries and perform dead-code elimination. Without TypeScript, neither works.

If you are migrating an existing JavaScript project, rename your files to `.ts` and `.tsx`. The compiler handles the rest.

## Tech Stack

| Layer | Technology |
|---|---|
| Compiler | oxc (Rust, open source) via napi-rs |
| Bundler | Vite 8 + Rolldown (Rust-native) |
| HTTP server | H3 (Node.js, Cloudflare Workers, Deno) |
| React | React 19 (streaming SSR, `use()`, concurrent mode) |
| Styles | Tailwind CSS v4 (zero-config) |
| Testing | Vitest (jsdom + node environments) |
| Package manager | pnpm workspaces |
