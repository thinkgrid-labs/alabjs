---
title: CLI
description: All alabjs CLI commands and flags.
sidebar:
  order: 7
---

The `alabjs` CLI is installed locally in your project. Run it via your package manager's script runner or `node_modules/.bin/alabjs`.

## Commands

### `alabjs dev`

Starts the development server with hot module replacement.

```bash
alabjs dev
alabjs dev --port 4000
alabjs dev --host 0.0.0.0
```

| Flag | Default | Description |
|---|---|---|
| `--port` | `3000` | Port to listen on |
| `--host` | `localhost` | Host to bind |
| `--open` | `false` | Open browser on start |

The dev server:
- Compiles TypeScript with the Rust/oxc compiler
- Runs Vite HMR for instant CSS and component updates
- Streams SSR using `renderToPipeableStream`
- Enforces server/client boundaries at dev time
- Shows rich error overlays with Rust-sourced line numbers

---

### `alabjs build`

Builds the app for production.

```bash
alabjs build
alabjs build --mode spa
alabjs build --analyze
alabjs build --skip-typecheck
```

| Flag | Default | Description |
|---|---|---|
| `--mode` | `ssr` | Build mode: `ssr` or `spa` |
| `--analyze` | `false` | Open bundle size treemap after build |
| `--skip-typecheck` | `false` | Skip `tsc --noEmit` |

**SSR mode** (default): Outputs a Node.js server bundle to `.alabjs/dist/`. Requires a Node.js runtime to serve.

**SPA mode**: Outputs a static `index.html` + hashed assets to `.alabjs/dist/spa/`. Deployable to any CDN. Server functions become fetch calls to `/_alabjs/fn/*` — point these at a separate API server.

The `--analyze` flag requires `rolldown-plugin-visualizer` or `rollup-plugin-visualizer` to be installed:

```bash
pnpm add -D rolldown-plugin-visualizer
```

---

### `alabjs start`

Serves the production build.

```bash
alabjs start
PORT=8080 alabjs start
```

| Environment Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `PUBLIC_URL` | — | Public base URL (for sitemap + CSRF) |

Must run `alabjs build` before `alabjs start`.

---

### `alabjs ssg`

Pre-renders static routes to HTML files.

```bash
alabjs ssg
alabjs ssg --out ./public
```

| Flag | Default | Description |
|---|---|---|
| `--out` | `.alabjs/dist/static` | Output directory |

SSG renders all routes without dynamic segments. For dynamic routes, export `generateStaticParams` from the page:

```ts
// app/posts/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await db.posts.findMany({ select: { slug: true } });
  return posts.map((p) => ({ slug: p.slug }));
}
```

---

### `alabjs info`

Prints environment and dependency information for bug reports.

```bash
alabjs info
```

Output includes: OS, Node.js version, pnpm version, AlabJS version, Vite version, Rust toolchain.

---

## Global flags

| Flag | Description |
|---|---|
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |

---

## Environment variables

| Variable | Commands | Description |
|---|---|---|
| `PORT` | `dev`, `start` | HTTP port |
| `HOST` | `dev`, `start` | Bind address |
| `NODE_ENV` | All | `development` in dev, `production` in start |
| `PUBLIC_URL` | `start`, `ssg` | Canonical base URL for sitemap + CSRF cookie |
| `ALAB_TYPECHECK` | `build` | Set to `0` to skip typecheck (same as `--skip-typecheck`) |

---

## Programmatic API

The CLI commands are also exported as functions for use in custom scripts:

```ts
import { build, dev, ssg } from "alabjs/commands";

await build({ cwd: process.cwd(), mode: "ssr", analyze: false });
await ssg({ cwd: process.cwd(), out: "./static" });
```
