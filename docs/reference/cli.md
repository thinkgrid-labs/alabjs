---
title: CLI
description: All alab CLI commands and flags.
---

The `alab` CLI is installed locally in your project. Run it via your package manager's script runner or `node_modules/.bin/alab`.

## Commands

### `alab dev`

Starts the development server with hot module replacement.

```bash
alab dev
alab dev --port 4000
alab dev --host 0.0.0.0
```

| Flag | Default | Description |
|---|---|---|
| `--port` | `3000` | Port to listen on |
| `--host` | `localhost` | Host to bind |

The dev server:
- Compiles TypeScript with the Rust/oxc compiler
- Runs Vite HMR for instant CSS and component updates
- Streams SSR using `renderToPipeableStream`
- Enforces server/client boundaries at dev time
- Shows rich error overlays with Rust-sourced line numbers

---

### `alab build`

Builds the app for production.

```bash
alab build
alab build --mode spa
alab build --analyze
alab build --skip-typecheck
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

### `alab start`

Serves the production build.

```bash
alab start
PORT=8080 alab start
```

| Environment Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `PUBLIC_URL` | — | Public base URL (for sitemap + CSRF) |

Must run `alab build` before `alab start`.

---

### `alab ssg`

Pre-renders static routes to HTML files.

```bash
alab ssg
```

SSG renders all routes without dynamic segments. For dynamic routes, export `generateStaticParams` from the page:

```ts
// app/posts/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await db.posts.findMany({ select: { slug: true } });
  return posts.map((p) => ({ slug: p.slug }));
}
```

---

### `alab test`

Runs tests with Vitest.

```bash
alab test
alab test --watch
alab test --ui
```

| Flag | Default | Description |
|---|---|---|
| `--watch` | `false` | Re-run tests on file changes |
| `--ui` | `false` | Open the Vitest UI in the browser |

You can also pass file paths to run a subset of tests:

```bash
alab test src/utils.test.ts
```

---

### `alab info`

Prints the route manifest, server functions, and boundary violations for the current project.

```bash
alab info
```

Output includes:
- **Route manifest** — all discovered routes, their kind (page / api / layout), and SSR status
- **Server functions** — every `defineServerFn` export and its generated POST endpoint
- **Boundary violations** — client files that illegally import server modules at runtime

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
await ssg({ cwd: process.cwd() });
```
