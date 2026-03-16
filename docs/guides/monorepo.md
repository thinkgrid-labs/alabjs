---
title: Monorepo Setup
description: Run multiple AlabJS apps in a single pnpm/npm/yarn workspace.
---

AlabJS works naturally inside a monorepo. Each app is its own package with its own `app/` directory. The `--cwd` flag lets you target any app from the monorepo root without changing directories.

## Recommended structure

```
my-monorepo/
├── apps/
│   ├── marketing/          ← public site (SSR)
│   │   ├── app/
│   │   ├── public/
│   │   └── package.json
│   └── dashboard/          ← internal tool (CSR)
│       ├── app/
│       ├── public/
│       └── package.json
├── packages/
│   └── ui/                 ← shared component library
│       ├── src/
│       └── package.json
├── package.json            ← workspace root
└── pnpm-workspace.yaml
```

## Workspace config

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

Each app's `package.json` depends on `alabjs` and can reference shared packages:

```json
{
  "name": "marketing",
  "dependencies": {
    "alabjs": "^0.2.5",
    "@my-org/ui": "workspace:*"
  }
}
```

## Running apps

Use `--cwd` to target a specific app from the workspace root:

```bash
# Development
alab dev --cwd apps/marketing
alab dev --cwd apps/dashboard

# Build
alab build --cwd apps/marketing
alab build --cwd apps/dashboard

# Production server
alab start --cwd apps/marketing
```

Or use the short alias `-C`:

```bash
alab dev -C apps/marketing
```

## Turbo (recommended for CI)

If you use [Turbo](https://turbo.build), add a `turbo.json` at the workspace root to orchestrate builds:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".alabjs/dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Each app's `package.json` declares its scripts:

```json
{
  "scripts": {
    "dev": "alab dev",
    "build": "alab build",
    "start": "alab start"
  }
}
```

Then from the root:

```bash
turbo dev          # starts all apps in parallel
turbo build        # builds all apps, respects dependency order
```

## Shared component library

Components in `packages/ui` are plain React — no special AlabJS integration needed.

```tsx
// packages/ui/src/Button.tsx
export function Button({ children, onClick }: ButtonProps) {
  return <button onClick={onClick}>{children}</button>;
}
```

Import them directly in any app page:

```tsx
// apps/marketing/app/page.tsx
import { Button } from "@my-org/ui";
```

Make sure `packages/ui` builds before apps that consume it. With Turbo, `"dependsOn": ["^build"]` handles this automatically.

## Shared server functions

You can share server functions across apps by placing them in a shared package. Because AlabJS enforces server/client boundaries at compile time, shared server functions work correctly as long as the shared package marks them with `.server.ts`:

```
packages/
  data/
    src/
      posts.server.ts    ← shared server function
```

```ts
// packages/data/src/posts.server.ts
import { defineServerFn } from "alabjs/server";

export const getPosts = defineServerFn(async () => {
  return db.posts.findMany();
});
```

Each app imports and uses it like any local server function:

```tsx
// apps/marketing/app/blog/page.tsx
import { useServerData } from "alabjs/client";
import { getPosts } from "@my-org/data/posts.server";

export default function BlogPage() {
  const posts = useServerData(getPosts);
  // ...
}
```

## Environment variables per app

Each app resolves `.env` from its own directory (`--cwd`). Apps do not share environment variables unless you explicitly set them at the workspace root and forward them.

```
apps/
  marketing/
    .env            ← ALAB_PUBLIC_SITE_NAME=Marketing
  dashboard/
    .env            ← ALAB_PUBLIC_SITE_NAME=Dashboard
```
