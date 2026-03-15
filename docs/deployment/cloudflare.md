---
title: Cloudflare Workers
description: Deploy AlabJS to Cloudflare Workers for global edge rendering.
---

AlabJS can be deployed to Cloudflare Workers for globally distributed edge rendering — your pages render in the data centre closest to each user with no cold starts.

## Prerequisites

- A Cloudflare account
- Wrangler CLI: `pnpm add -D wrangler`

## Build for Cloudflare

```bash
alab build
```

This produces:
- `_worker.js` — the Workers entry point
- `_routes.json` — tells Cloudflare which paths the Worker handles vs. which are static assets

## Configure Wrangler

```toml
# wrangler.toml
name = "my-alabjs-app"
compatibility_date = "2025-09-01"
compatibility_flags = ["nodejs_compat"]

main = "_worker.js"

[assets]
directory = ".alabjs/dist/client"
```

The `nodejs_compat` flag enables Node.js built-ins (`crypto`, `Buffer`, etc.) in the Workers runtime.

## Deploy

```bash
pnpm wrangler deploy
```

## Environment variables

Set secrets via Wrangler:

```bash
wrangler secret put DATABASE_URL
wrangler secret put SESSION_SECRET
```

Access them in server functions via `process.env` — the Cloudflare adapter polyfills `process.env` from the Workers environment bindings.

## KV and D1

Cloudflare bindings (KV, D1, R2, Durable Objects) are available in server functions via the Workers request context. Access them through the `ctx` parameter:

```ts
// app/posts/page.server.ts
import { defineServerFn } from "alabjs/server";

export const getPosts = defineServerFn(async (_, { env }) => {
  // env is the Cloudflare Workers env object
  const result = await env.DB.prepare("SELECT * FROM posts").all();
  return result.results;
});
```

## Limitations

| Feature | Status |
|---|---|
| Streaming SSR | Supported (Workers support `ReadableStream`) |
| Server functions | Supported |
| Image optimization | Limited — Cloudflare Images is recommended instead |
| Offline service worker | Supported |
| Node.js built-ins | Supported via `nodejs_compat` flag |
| File system access | Not available — use KV or R2 instead |

## Local development

Test your Cloudflare build locally with Wrangler's dev mode:

```bash
pnpm wrangler dev _worker.js --assets .alabjsjs/dist/client
```

This runs the exact same Workers runtime locally, including bindings. Use `--remote` to connect to your actual Cloudflare KV/D1 data.

## Custom domains

After deploying, add a custom domain in the Cloudflare dashboard under Workers → your worker → Triggers → Custom Domains. No Nginx, no load balancer.

## Pages vs Workers

AlabJS targets **Workers** (not Pages) for full server-side rendering flexibility. If you only need to serve static assets, use `alab build --mode spa` and deploy the `spa/` output to Cloudflare Pages directly.
