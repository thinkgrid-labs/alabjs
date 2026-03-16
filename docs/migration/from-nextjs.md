# Migrating from Next.js

This guide helps you move a Next.js application to AlabJS. The two frameworks share a lot of DNA — file-system routing, SSR, layouts, API routes — so most concepts map directly.

## Mental model shift

| Next.js | AlabJS |
|---|---|
| App Router / Pages Router | Single file-system router (`app/`) |
| React Server Components | Server Functions (`.server.ts`) |
| `"use client"` directive | CSR is the default; add `export const ssr = true` to opt in |
| `"use server"` directive | `defineServerFn` in `.server.ts` files |
| Edge / Node.js runtime toggle | Single H3 runtime — deploy anywhere |
| `NEXT_PUBLIC_` | `ALAB_PUBLIC_` |

---

## Project structure

Both frameworks use an `app/` directory with nested layouts.

**Next.js**
```
app/
  layout.tsx
  page.tsx
  posts/
    layout.tsx
    page.tsx
    [id]/
      page.tsx
```

**AlabJS** — identical convention:
```
app/
  layout.tsx
  page.tsx
  posts/
    layout.tsx
    page.tsx
    [id]/
      page.tsx
```

No changes needed here.

---

## Routing

### Static routes
Identical. `app/about/page.tsx` → `/about` in both frameworks.

### Dynamic segments
Identical. `[id]` and `[...slug]` work the same way.

### Accessing params

**Next.js (App Router)**
```tsx
export default function PostPage({ params }: { params: { id: string } }) {
  return <h1>Post {params.id}</h1>;
}
```

**AlabJS**
```tsx
import { useParams } from "alabjs";

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  return <h1>Post {id}</h1>;
}
```

---

## Layouts

Layouts work the same way — `layout.tsx` wraps all child routes.

**Next.js**
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

**AlabJS** — identical:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

---

## Server-side rendering

**Next.js** — components are server by default, opt out with `"use client"`:
```tsx
// Server component by default
export default async function Page() {
  const data = await fetch("https://api.example.com/posts").then(r => r.json());
  return <div>{data.title}</div>;
}
```

**AlabJS** — CSR by default, opt in to SSR, fetch data via server functions:
```tsx
// page.tsx
export const ssr = true;

import { useServerData } from "alabjs";
import { getPosts } from "./posts.server";

export default function Page() {
  const posts = useServerData(getPosts);
  return <div>{posts[0].title}</div>;
}
```

```ts
// posts.server.ts
import { defineServerFn } from "alabjs";

export const getPosts = defineServerFn(async () => {
  const data = await fetch("https://api.example.com/posts").then(r => r.json());
  return data;
});
```

The key difference: in AlabJS, **all server code lives in `.server.ts` files**. The Rust compiler enforces this at build time — no accidental leaks.

---

## Data fetching

### `getServerSideProps` → server function

**Next.js (Pages Router)**
```tsx
export async function getServerSideProps() {
  const post = await db.posts.findFirst();
  return { props: { post } };
}

export default function Page({ post }) {
  return <h1>{post.title}</h1>;
}
```

**AlabJS**
```tsx
// page.tsx
export const ssr = true;
import { useServerData } from "alabjs";
import { getPost } from "./post.server";

export default function Page() {
  const post = useServerData(getPost);
  return <h1>{post.title}</h1>;
}
```

```ts
// post.server.ts
import { defineServerFn } from "alabjs";

export const getPost = defineServerFn(async () => {
  return db.posts.findFirst();
});
```

### `getStaticProps` → server function + `revalidate`

**Next.js**
```tsx
export async function getStaticProps() {
  const posts = await getPosts();
  return { props: { posts }, revalidate: 60 };
}
```

**AlabJS**
```tsx
export const revalidate = 60; // ISR — revalidate every 60s
export const ssr = true;
```

```ts
// posts.server.ts
export const getPosts = defineServerFn(
  async () => db.posts.findMany(),
  { cache: { ttl: 60, tags: ["posts"] } }
);
```

### `getStaticPaths` → `generateStaticParams`

**Next.js**
```tsx
export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map(p => ({ id: String(p.id) }));
}
```

**AlabJS** — same name, same shape:
```tsx
export async function generateStaticParams() {
  const posts = await db.posts.findMany({ select: { id: true } });
  return posts.map(p => ({ id: String(p.id) }));
}
```

---

## Server Actions → Server Functions + Mutations

**Next.js**
```tsx
async function createPost(formData: FormData) {
  "use server";
  await db.posts.create({ data: { title: formData.get("title") } });
  revalidatePath("/posts");
}

export default function Page() {
  return <form action={createPost}><button>Create</button></form>;
}
```

**AlabJS**
```ts
// create-post.server.ts
import { defineServerFn } from "alabjs";

export const createPost = defineServerFn(
  z.object({ title: z.string() }),
  async ({ title }) => {
    await db.posts.create({ data: { title } });
  }
);
```

```tsx
// page.tsx
import { useMutation } from "alabjs";
import { createPost } from "./create-post.server";

export default function Page() {
  const { mutate, status } = useMutation(createPost);

  return (
    <form onSubmit={e => {
      e.preventDefault();
      mutate({ title: e.currentTarget.title.value });
    }}>
      <input name="title" />
      <button disabled={status === "pending"}>Create</button>
    </form>
  );
}
```

---

## API Routes

**Next.js**
```ts
// app/api/posts/route.ts
export async function GET() {
  const posts = await db.posts.findMany();
  return Response.json(posts);
}
```

**AlabJS** — identical:
```ts
// app/api/posts/route.ts
export async function GET() {
  const posts = await db.posts.findMany();
  return Response.json(posts);
}
```

No changes needed.

---

## Metadata

**Next.js**
```tsx
export const metadata = {
  title: "My App",
  description: "Welcome",
  openGraph: { title: "My App" },
};

export async function generateMetadata({ params }) {
  const post = await getPost(params.id);
  return { title: post.title };
}
```

**AlabJS** — identical API:
```tsx
export const metadata = {
  title: "My App",
  description: "Welcome",
  openGraph: { title: "My App" },
};

export async function generateMetadata({ params }: { params: { id: string } }) {
  const post = await db.posts.findUnique({ where: { id: params.id } });
  return { title: post.title };
}
```

---

## Components

| Next.js | AlabJS | Notes |
|---|---|---|
| `next/image` → `<Image>` | `alabjs/components` → `<Image>` | Same props, Rust WebP conversion |
| `next/link` → `<Link>` | `alabjs/components` → `<Link>` | Same `href` prop, SPA navigation |
| `next/script` → `<Script>` | `alabjs/components` → `<Script>` | Same `strategy` prop |
| `next/font` → `<Font>` | `alabjs/components` → `<Font>` | Google Fonts, `display: swap` |

**Next.js**
```tsx
import Image from "next/image";
import Link from "next/link";

<Image src="/hero.png" alt="Hero" width={800} height={400} />
<Link href="/posts">Posts</Link>
```

**AlabJS**
```tsx
import { Image, Link } from "alabjs/components";

<Image src="/hero.png" alt="Hero" width={800} height={400} />
<Link href="/posts">Posts</Link>
```

---

## Environment variables

**Next.js**
```
NEXT_PUBLIC_API_URL=https://api.example.com   # client-safe
DATABASE_URL=postgres://...                    # server-only
```

**AlabJS** — rename the prefix:
```
ALAB_PUBLIC_API_URL=https://api.example.com   # client-safe
DATABASE_URL=postgres://...                    # server-only (unchanged)
```

Update your `env.d.ts`:
```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly ALAB_PUBLIC_API_URL?: string;
}
```

Usage is identical: `import.meta.env.ALAB_PUBLIC_API_URL`.

---

## Middleware

**Next.js**
```ts
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (!request.cookies.get("token")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
```

**AlabJS**
```ts
// middleware.ts
import { defineMiddleware, redirect, next } from "alabjs";

export default defineMiddleware(
  ["/dashboard/*"],
  (req) => {
    if (!req.headers.get("cookie")?.includes("token=")) {
      return redirect("/login");
    }
    return next();
  }
);
```

---

## Partial Prerendering

**Next.js (experimental)**
```tsx
import { Suspense } from "react";
import { unstable_noStore as noStore } from "next/cache";

export const experimental_ppr = true;

function DynamicPosts() {
  noStore();
  // ...
}

export default function Page() {
  return (
    <>
      <h1>Posts</h1>
      <Suspense fallback={<Spinner />}>
        <DynamicPosts />
      </Suspense>
    </>
  );
}
```

**AlabJS**
```tsx
import { Dynamic } from "alabjs/components";

export const ppr = true;

export default function Page() {
  return (
    <>
      <h1>Posts</h1>
      <Dynamic id="posts-list" fallback={<Spinner />}>
        <Posts />
      </Dynamic>
    </>
  );
}
```

AlabJS PPR is stable (not experimental) and uses an explicit `<Dynamic>` boundary instead of `Suspense` + `noStore()`.

---

## What doesn't exist in AlabJS (yet)

| Next.js feature | Status |
|---|---|
| React Server Components (RSC) | Planned — not in v0.x |
| Edge runtime | Planned — Cloudflare adapter in progress |
| `next/headers` (read headers in RSC) | Use server functions instead |
| `revalidateTag` / `revalidatePath` | Use `{ cache: { tags } }` on server functions |
| `notFound()` / `redirect()` in RSC | Use `not-found.tsx` / `middleware.ts` |
| Turbopack | AlabJS uses Vite 8 + Rolldown (same Rust-native approach) |

---

## Quick reference

| Task | Next.js | AlabJS |
|---|---|---|
| Enable SSR | default (App Router) | `export const ssr = true` |
| Fetch server data | `async` server component | `defineServerFn` + `useServerData` |
| Mutate data | Server Actions | `defineServerFn` + `useMutation` |
| API endpoint | `app/api/x/route.ts` | `app/api/x/route.ts` |
| Environment variable (client) | `NEXT_PUBLIC_` | `ALAB_PUBLIC_` |
| Image component | `next/image` | `alabjs/components` `<Image>` |
| Cache a fetch | `fetch(url, { next: { revalidate: 60 } })` | `defineServerFn(fn, { cache: { ttl: 60 } })` |
| Redirect in middleware | `NextResponse.redirect()` | `redirect()` |
| Not-found page | `not-found.tsx` | `not-found.tsx` |
| Loading UI | `loading.tsx` | `loading.tsx` |
| Error boundary | `error.tsx` | `error.tsx` |
