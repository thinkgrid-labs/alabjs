---
title: "Guide: Building a SPA"
description: Build a client-rendered single-page application with Alab — no server required.
sidebar:
  order: 1
---

# Building a SPA with Alab

This guide covers building a client-side single-page application (SPA) with Alab. A SPA renders entirely in the browser — no server-side rendering, no Node.js process in production. The output is a folder of static files you can host on any CDN.

## When to Use SPA Mode

SPA mode is the right choice when:

- The app is behind authentication (pages don't need to be indexed by search engines)
- You are building a dashboard, admin panel, or internal tool
- You want to deploy to a static host (Netlify, GitHub Pages, S3, Cloudflare Pages)
- You need to call a separate backend API (your own server, Supabase, Firebase, etc.)

If you need SEO, public-facing content, or dynamic OG images, use SSR instead.

## Creating a SPA Project

```bash
npx create-alab@latest my-spa
cd my-spa
pnpm dev
```

By default, all pages in Alab are client-rendered. A new project is already a SPA.

## Project Structure

```
my-spa/
├── app/
│   ├── layout.tsx          ← shell: nav bar, providers, auth context
│   ├── page.tsx            ← / (landing or redirect to /dashboard)
│   ├── login/
│   │   └── page.tsx        ← /login
│   └── dashboard/
│       ├── layout.tsx      ← authenticated layout with sidebar
│       ├── page.tsx        ← /dashboard
│       └── settings/
│           └── page.tsx    ← /dashboard/settings
├── app/globals.css
└── package.json
```

## Pages (All CSR)

Pages render in the browser. No `export const ssr` needed.

```tsx
// app/dashboard/page.tsx
import { useServerData } from "alab/client";
import type { getDashboardStats } from "./page.server";

export default function DashboardPage() {
  const stats = useServerData<typeof getDashboardStats>("getDashboardStats");

  return (
    <div className="grid grid-cols-3 gap-6">
      <StatCard label="Users" value={stats.users} />
      <StatCard label="Revenue" value={stats.revenue} />
      <StatCard label="Orders" value={stats.orders} />
    </div>
  );
}
```

## Navigation

Use `<Link>` for client-side navigation without page reloads.

```tsx
import { Link } from "alab/components";

export default function Sidebar() {
  return (
    <nav className="w-64 border-r h-screen p-4 flex flex-col gap-2">
      <Link href="/dashboard" className="nav-item">Overview</Link>
      <Link href="/dashboard/settings" className="nav-item">Settings</Link>
    </nav>
  );
}
```

## Authentication Guard

Use middleware to redirect unauthenticated users.

```ts
// middleware.ts
import { redirect, next } from "alab/middleware";

export async function middleware(req: Request) {
  const { pathname } = new URL(req.url);

  if (pathname.startsWith("/dashboard")) {
    const hasSession = req.headers.get("cookie")?.includes("session=");
    if (!hasSession) return redirect("/login");
  }

  return next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

## Mutations

```tsx
// app/dashboard/settings/page.tsx
import type { updateProfile } from "./page.server";
import { useMutation } from "alab/client";

export default function SettingsPage() {
  const { mutate, isPending, isSuccess, error } =
    useMutation<typeof updateProfile>("updateProfile");

  return (
    <form onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      mutate({
        name: data.get("name") as string,
        email: data.get("email") as string,
      });
    }}>
      <input name="name" />
      <input name="email" type="email" />
      <button disabled={isPending}>{isPending ? "Saving…" : "Save"}</button>
      {isSuccess && <p className="text-green-600">Saved.</p>}
      {error && <p className="text-red-600">{error.message}</p>}
    </form>
  );
}
```

## Offline Support

SPA users often expect the app to work when connectivity drops.

```tsx
// app/layout.tsx
import { useOfflineMutations } from "alab/client";

export default function RootLayout({ children }) {
  const { isOffline, queuedCount, replay } = useOfflineMutations();

  return (
    <>
      {isOffline && (
        <div className="fixed top-0 inset-x-0 bg-yellow-400 text-yellow-900 text-sm text-center py-1">
          You are offline — {queuedCount} change(s) queued
          <button onClick={replay} className="ml-2 underline">Sync now</button>
        </div>
      )}
      {children}
    </>
  );
}
```

When the user goes offline, any mutations that fail are queued in IndexedDB and replayed automatically when connectivity returns.

## Real-Time Updates

```tsx
// app/dashboard/page.tsx
import { useSSE } from "alab/client";

export default function LiveDashboard() {
  const { data: stats } = useSSE<{ users: number; revenue: number }>(
    "/api/stats/stream",
    { event: "stats-update" },
  );

  return <StatGrid stats={stats} />;
}
```

```ts
// app/api/stats/route.ts
import { defineSSEHandler } from "alab/server";

export const GET = defineSSEHandler(async function* () {
  while (true) {
    const stats = await db.getStats();
    yield { event: "stats-update", data: stats };
    await new Promise(r => setTimeout(r, 5_000));
  }
});
```

## Building for Production

```bash
# SPA build — outputs a static folder with index.html + hashed assets
alab build --mode spa
```

The output is in `.alab/dist/spa/`. Deploy the contents of that folder to:

- **Netlify** — `netlify deploy --dir .alab/dist/spa`
- **Cloudflare Pages** — point the build output to `.alab/dist/spa`
- **GitHub Pages** — push contents to the `gh-pages` branch
- **AWS S3 + CloudFront** — sync the folder to your bucket

### Routing on a Static Host

All routes in Alab are client-side, so you need to configure the host to serve `index.html` for any path.

**Netlify** — create `public/_redirects`:
```
/* /index.html 200
```

**Cloudflare Pages** — create `public/_routes.json`:
```json
{ "version": 1, "include": ["/*"], "exclude": [] }
```
