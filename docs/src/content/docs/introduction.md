---
title: Introduction
description: What is Alab and why does it exist?
---

Alab is an open-source React meta-framework with a Rust compiler core.

## Why Alab?

Next.js is powerful but ships Vercel lock-in, opaque RSC boundaries, and cryptic build errors. Remix forces SSR everywhere. Alab is different:

- **Rust-powered** — oxc-based compiler, 50–100× faster than Babel
- **Explicit boundaries** — `.server.ts` files are enforced at compile time, not by magic directives
- **Opt-in SSR** — CSR by default, `export const ssr = true` per route
- **Zero lock-in** — runs on any Node.js 22+ server

## Quick start

```bash
npx create-alab@latest my-app
cd my-app
pnpm install
pnpm dev
```

Your app is live at `http://localhost:3000`.
