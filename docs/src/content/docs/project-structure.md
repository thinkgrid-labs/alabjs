---
title: Project Structure
description: How an Alab project is organized.
---

```
my-app/
├── app/                        ← All routes live here
│   ├── globals.css             ← Global styles (Tailwind @import)
│   ├── page.tsx                ← Root route (/)
│   ├── about/
│   │   └── page.tsx            ← /about
│   └── posts/
│       └── [slug]/
│           ├── page.tsx        ← /posts/:slug (client component)
│           └── page.server.ts  ← Server functions for this route
├── public/                     ← Static assets (images, fonts, etc.)
├── package.json
└── tsconfig.json
```

## Key conventions

- `page.tsx` — React page component
- `page.server.ts` — Server functions (`defineServerFn`) for the route
- `[param]` folders — Dynamic route segments
- `globals.css` — Imported on every page via the virtual `/@alab/client` module

## Build output

```
.alab/
├── dist/
│   ├── client/     ← Vite-bundled client assets
│   └── server/     ← Compiled server code
```
