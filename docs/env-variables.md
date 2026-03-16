---
title: Environment Variables
description: Use ALAB_PUBLIC_ to expose env vars to the browser. Everything else stays server-only.
---

AlabJS enforces a hard boundary between server-side and client-side environment variables. Variables must be explicitly opted into the browser bundle — accidental exposure of secrets is impossible by design.

## Quick reference

| Prefix | Available in | Example |
|---|---|---|
| `ALAB_PUBLIC_` | Browser + Server | `ALAB_PUBLIC_API_URL` |
| `VITE_` | Browser + Server | `VITE_THEME` (Vite compat) |
| *(no prefix)* | Server only | `DATABASE_URL`, `ALAB_REVALIDATE_SECRET` |

## Client-side variables

Prefix any variable with `ALAB_PUBLIC_` to make it available in the browser:

```sh
# .env
ALAB_PUBLIC_API_URL=https://api.example.com
ALAB_PUBLIC_APP_NAME=My App
```

Access them via `import.meta.env`:

```ts
// Works in any component, client or server
const apiUrl = import.meta.env.ALAB_PUBLIC_API_URL;
const appName = import.meta.env.ALAB_PUBLIC_APP_NAME;
```

These values are **inlined at build time** by Vite. They become literal strings in the browser bundle — there is no runtime lookup.

## Server-only variables

Variables **without** the `ALAB_PUBLIC_` prefix never leave the server:

```sh
# .env
DATABASE_URL=postgres://...
ALAB_REVALIDATE_SECRET=super-secret
ALAB_ANALYTICS_SECRET=also-secret
CLOUDFLARE_API_TOKEN=cf-token
```

Access them on the server via `process.env`:

```ts
// server function, API route, or server-side code only
import { defineServerFn } from "alabjs/server";

export const getUser = defineServerFn(async ({ id }) => {
  const db = await connect(process.env["DATABASE_URL"]!);
  return db.users.findById(id);
});
```

If you try to use `process.env.DATABASE_URL` in a client component, Vite replaces it with `undefined` — the value is never bundled.

## Why not just `ALAB_`?

AlabJS reserves the bare `ALAB_` prefix for **framework-level server config**:

```sh
ALAB_CDN=cloudflare              # server config
ALAB_REVALIDATE_SECRET=secret    # server secret
ALAB_ANALYTICS_SECRET=secret     # server secret
```

If `ALAB_` were the client prefix, any of these secrets could be accidentally exposed by forgetting the `_PUBLIC_` part. The `ALAB_PUBLIC_` prefix makes the intent explicit and impossible to misuse.

## `.env` files

AlabJS uses Vite's standard `.env` file loading:

| File | Loaded when |
|---|---|
| `.env` | Always |
| `.env.local` | Always (git-ignored) |
| `.env.development` | `alab dev` only |
| `.env.production` | `alab build` + `alab start` only |
| `.env.development.local` | `alab dev` only, git-ignored |
| `.env.production.local` | `alab build` + `alab start` only, git-ignored |

`.local` files are never committed. Add them to `.gitignore` and use them for machine-specific overrides.

## TypeScript types

Add an `env.d.ts` file at the root of your project to get autocomplete for your variables:

```ts
// env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ALAB_PUBLIC_API_URL: string;
  readonly ALAB_PUBLIC_APP_NAME: string;
  // add more ALAB_PUBLIC_ vars here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

## Runtime env vars (server only)

Server-only variables can also be set at runtime without rebuilding:

```sh
DATABASE_URL=postgres://prod-server/db alab start
```

This is useful in Docker / Kubernetes where secrets are injected at container start time rather than build time.

## Built-in AlabJS variables

These are read by AlabJS internally — set them in your server environment, not in `.env` files committed to git:

| Variable | Used by | Description |
|---|---|---|
| `ALAB_CDN` | CDN Cache Headers | CDN provider: `cloudflare` or `fastly` |
| `ALAB_REVALIDATE_SECRET` | ISR + CDN purge | Bearer token for `/_alabjs/revalidate` |
| `ALAB_ANALYTICS_SECRET` | Analytics | Bearer token for `/_alabjs/analytics` |
| `CLOUDFLARE_ZONE_ID` | CDN Cache Headers | Cloudflare zone ID |
| `CLOUDFLARE_API_TOKEN` | CDN Cache Headers | Cloudflare API token (Cache Purge permission) |
| `FASTLY_SERVICE_ID` | CDN Cache Headers | Fastly service ID |
| `FASTLY_API_TOKEN` | CDN Cache Headers | Fastly API token |
| `PUBLIC_URL` | Sitemap, Messenger | Full public URL of your site (e.g. `https://example.com`) |
| `PORT` | Server | Port to listen on (default `3000`) |
