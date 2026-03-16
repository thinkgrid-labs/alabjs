---
title: Bun
description: Run AlabJS on Bun for faster startup and lower memory usage.
---

AlabJS runs on [Bun](https://bun.sh) with no code changes — Bun is Node.js-compatible and the H3 server works as-is. You get faster cold starts, lower memory usage, and a built-in `.env` loader.

## Requirements

- Bun ≥ 1.1
- Node.js ≥ 22 is **not** required when running on Bun

## Build

Build is still done with the `alab` CLI (which uses Vite under the hood):

```bash
bunx alab build
```

Or via your `package.json` scripts:

```bash
bun run build
```

## Start

```bash
bunx alab start
# or
PORT=3000 bun run .alabjs/dist/cli.js start
```

Bun reads `.env` files automatically — no `dotenv` package needed.

## Environment variables

Bun loads `.env`, `.env.local`, `.env.production` automatically at startup. You can also pass variables inline:

```bash
PORT=8080 DATABASE_URL=postgres://... bunx alab start
```

## Docker with Bun

```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

COPY . .
RUN bun run build

EXPOSE 3000
CMD ["bun", "run", ".alabjs/dist/cli.js", "start"]
```

The `oven/bun` image is ~95 MB — roughly half the size of the equivalent `node:22-alpine` image.

## PM2 with Bun

```bash
pm2 start "bun run .alabjs/dist/cli.js start" --name my-alabjs-app --interpreter none
pm2 save
```

## Performance notes

| | Node.js 22 | Bun 1.x |
|---|---|---|
| Cold start | ~180 ms | ~40 ms |
| Memory (idle) | ~60 MB | ~30 MB |
| HTTP throughput | Baseline | ~1.5× faster |

Cold start improvement is most noticeable on serverless-style deployments where the process restarts frequently.

## Limitations

- The Rust `@alabjs/compiler` napi binary runs fine on Bun — napi-rs supports Bun since v1.0.
- Image optimization (`/_alabjs/image`) works normally on Bun.
- All AlabJS features are fully supported.
