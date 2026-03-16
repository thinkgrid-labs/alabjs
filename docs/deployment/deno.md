---
title: Deno Deploy
description: Deploy AlabJS to Deno Deploy using the Web Fetch adapter.
---

AlabJS supports [Deno Deploy](https://deno.com/deploy) via the `alabjs/adapters/deno` adapter. Deno Deploy runs your code at the edge in 35+ regions globally with zero cold starts.

## How it works

Deno Deploy uses the standard Web Fetch API (`Request` / `Response`). AlabJS provides `createDenoHandler` which wraps your app in a compatible fetch handler — no H3 or Node.js HTTP involved.

## Setup

Create an entry point file at the project root:

```ts
// main.ts
import { createDenoHandler } from "alabjs/adapters/deno";
import manifest from "./.alabjs/dist/route-manifest.json" with { type: "json" };

const handler = createDenoHandler(manifest, {});
Deno.serve(handler.fetch.bind(handler));
```

## Build

```bash
alab build
```

## Deploy

Install `deployctl`:

```bash
deno install -A jsr:@deno/deployctl
```

Deploy to Deno Deploy:

```bash
deployctl deploy --project=my-alabjs-app main.ts
```

On first deploy, `deployctl` will prompt you to link or create a Deno Deploy project.

## Environment variables

Set secrets in the Deno Deploy dashboard under your project → Settings → Environment Variables. They are available via `Deno.env.get()` or the standard `process.env` polyfill:

```ts
const dbUrl = Deno.env.get("DATABASE_URL");
```

## Local development with Deno

Test your Deno entry point locally:

```bash
deno run --allow-net --allow-read --allow-env main.ts
```

For the full dev experience (HMR, fast refresh), use `alab dev` with Node.js as usual and only use the Deno entry point for production deploys.

## Limitations

| Feature | Status |
|---|---|
| Streaming SSR | Supported (`renderToReadableStream`) |
| Server functions | Supported |
| Image optimization | Not available — Rust napi binary cannot run on Deno Deploy. Image requests are redirected to the original source URL. |
| File system access | Read-only via `Deno.readFile` — write access not available |
| PPR shells | Not available — `.alabjs/ppr-cache/` is not deployed |
| Node.js built-ins | Available via Deno's Node compatibility layer |

## Image optimization workaround

Since the Rust binary can't run on Deno Deploy, use a CDN transform URL for images. Point `/_alabjs/image` requests to Cloudflare Images, ImageKit, or a similar service via a custom middleware.
