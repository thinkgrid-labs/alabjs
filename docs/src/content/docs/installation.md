---
title: Installation
description: Create a new AlabJS project and understand the project structure.
sidebar:
  order: 2
---

# Installation

## Requirements

- **Node.js 22 or later**
- **pnpm 10 or later** (recommended)

## Create a New App

```bash
npx create-alab@latest my-app
cd my-app
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Your app is running.

No config files to touch. Tailwind is ready. TypeScript is ready. The Rust compiler is active.

## Available Templates

`create-alab` ships three templates:

| Template | Command | Best for |
|---|---|---|
| `basic` | `create-alab my-app` | Starting from scratch |
| `blog` | `create-alab my-app --template blog` | Content-heavy sites with SSR |
| `dashboard` | `create-alab my-app --template dashboard` | Admin UIs with server functions |

## Project Structure

```
my-app/
├── app/
│   ├── layout.tsx              ← root layout (wraps all pages)
│   ├── not-found.tsx           ← custom 404 page
│   ├── page.tsx                ← home route  /
│   ├── page.server.ts          ← server functions for home
│   ├── about/
│   │   └── page.tsx            ← /about
│   └── posts/
│       ├── layout.tsx          ← layout for /posts/*
│       ├── page.tsx            ← /posts
│       ├── page.server.ts
│       └── [id]/
│           ├── page.tsx        ← /posts/:id
│           ├── page.server.ts
│           ├── loading.tsx     ← shown while data loads
│           └── error.tsx       ← shown on render error
├── middleware.ts               ← runs before every request
├── public/                     ← static files served as-is
├── app/globals.css             ← Tailwind entry point
└── package.json
```

## CLI Commands

```bash
alab dev                    # Dev server with HMR
alab build                  # Production build (Vite 8 + Rolldown)
alab build --mode spa       # Client-only SPA build
alab build --analyze        # Build + open bundle treemap
alab start                  # Start production H3 server
alab ssg                    # Pre-render static routes to HTML
alab test                   # Run tests with Vitest
alab test --watch           # Watch mode
alab test --ui              # Vitest UI
alab info                   # Print route manifest and compiler info
```
