---
title: Railway
description: One-command deployment to Railway with automatic HTTPS and zero config.
---

[Railway](https://railway.app) is the fastest way to get AlabJS running on a managed server — push to GitHub and Railway builds and deploys automatically.

## Setup

1. Push your AlabJS project to a GitHub repository.
2. Create a new Railway project and link the repository.
3. Railway auto-detects Node.js and runs `npm run build` followed by `npm run start`.

Update your `package.json` start script if needed:

```json
{
  "scripts": {
    "build": "alab build",
    "start": "alab start"
  }
}
```

## Environment variables

Set variables in the Railway dashboard under your service → Variables. Railway automatically injects `PORT` — AlabJS reads it automatically.

```bash
# Railway dashboard variables
NODE_ENV=production
PUBLIC_URL=https://my-app.up.railway.app
DATABASE_URL=postgres://user:pass@host/db
ALAB_REVALIDATE_SECRET=your-secret
```

Railway also supports reference variables — in the dashboard you can set a variable's value to point at another service's variable (e.g. linking a Postgres plugin's `DATABASE_URL` directly). See the Railway docs for reference syntax.

## Custom domain

Railway provides a `.up.railway.app` subdomain automatically. To use a custom domain, go to your service → Settings → Domains and add a CNAME record.

Update `PUBLIC_URL` to match:

```bash
PUBLIC_URL=https://yourdomain.com
```

## Dockerfile (optional)

Railway also supports Docker. Use the `node:22-alpine` Dockerfile from the [Node.js deployment guide](/deployment/node) or the [Bun guide](/deployment/bun) — Railway detects a `Dockerfile` in the root automatically.

## Scaling

Railway scales horizontally — add more replicas from the service settings. AlabJS is stateless (ISR cache is in-memory per instance, analytics are per-instance). For shared state across replicas, use an external Redis for the ISR cache.
