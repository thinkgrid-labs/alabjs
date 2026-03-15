---
title: Self-hosted Node.js
description: Deploy AlabJS on any Node.js server.
---

AlabJS runs on any Node.js ≥ 22 server with no cloud-specific dependencies.

## Build

```bash
pnpm build
```

This compiles TypeScript with the Rust compiler, bundles the client with Vite, and outputs to `.alabjs/dist/`.

## Start

```bash
pnpm start
# or directly:
PORT=8080 node node_modules/.bin/alabjs start
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Set to `production` in prod |
| `PUBLIC_URL` | — | Public base URL (for sitemap + CSRF) |

## Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "node_modules/.bin/alabjs", "start"]
```

## PM2

```bash
pm2 start "node node_modules/.bin/alabjs start" --name my-alabjs-app
pm2 save
pm2 startup
```
