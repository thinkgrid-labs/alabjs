# Migrating from TanStack Start

TanStack Start and AlabJS share the same philosophy — TypeScript-first, explicit data fetching, type-safe server functions, no magic. The migration is mostly a syntax translation rather than a mental model shift.

## Mental model comparison

| TanStack Start | AlabJS |
|---|---|
| Code-based file routes (`createFileRoute`) | File-system routing by default; code-based router available |
| `loader` on route definition | `defineServerFn` + `useServerData` |
| `createServerFn` | `defineServerFn` in `.server.ts` files |
| TanStack Query for client cache | `useServerData` (built-in Suspense) + TanStack Query optional |
| Vinxi bundler | Vite 8 + Rolldown (Rust-native) |
| `VITE_` env prefix | `ALAB_PUBLIC_` env prefix |
| SSR on by default | CSR by default; `export const ssr = true` to opt in |

---

## Project structure

**TanStack Start**
```
app/
  routes/
    __root.tsx       ← root layout
    index.tsx
    posts/
      index.tsx
      $id.tsx
  router.tsx
  routeTree.gen.ts   ← auto-generated, do not edit
  client.tsx
  ssr.tsx
```

**AlabJS**
```
app/
  layout.tsx         ← root layout
  page.tsx
  posts/
    page.tsx
    [id]/
      page.tsx
```

No generated files — the router is derived from the file tree at build time by the Rust compiler.

---

## Routing

### Defining routes

**TanStack Start** — explicit `createFileRoute` call in every file:
```tsx
// app/routes/posts/index.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/posts/")({
  component: PostsPage,
});

function PostsPage() {
  return <h1>Posts</h1>;
}
```

**AlabJS** — default export is the page, no boilerplate:
```tsx
// app/posts/page.tsx
export default function PostsPage() {
  return <h1>Posts</h1>;
}
```

### Dynamic segments

**TanStack Start** — `$param` convention:
```
app/routes/posts/$id.tsx
```

**AlabJS** — `[param]` convention:
```
app/posts/[id]/page.tsx
```

### Reading params

**TanStack Start**
```tsx
export const Route = createFileRoute("/posts/$id")({
  component: PostPage,
});

function PostPage() {
  const { id } = Route.useParams();
  return <h1>Post {id}</h1>;
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

### Root layout

**TanStack Start**
```tsx
// app/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <html lang="en">
      <body>
        <Outlet />
      </body>
    </html>
  ),
});
```

**AlabJS**
```tsx
// app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

---

## Data fetching

### Route loaders → server functions

**TanStack Start**
```tsx
// app/routes/posts/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";

const getPosts = createServerFn({ method: "GET" }).handler(async () => {
  return db.posts.findMany();
});

export const Route = createFileRoute("/posts/")({
  loader: () => getPosts(),
  component: PostsPage,
});

function PostsPage() {
  const posts = Route.useLoaderData();
  return (
    <ul>
      {posts.map(p => <li key={p.id}>{p.title}</li>)}
    </ul>
  );
}
```

**AlabJS**
```ts
// app/posts/posts.server.ts
import { defineServerFn } from "alabjs";

export const getPosts = defineServerFn(async () => {
  return db.posts.findMany();
});
```

```tsx
// app/posts/page.tsx
import { useServerData } from "alabjs";
import { getPosts } from "./posts.server";

export const ssr = true;

export default function PostsPage() {
  const posts = useServerData(getPosts);
  return (
    <ul>
      {posts.map(p => <li key={p.id}>{p.title}</li>)}
    </ul>
  );
}
```

### With params

**TanStack Start**
```tsx
const getPost = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    return db.posts.findUnique({ where: { id: data.id } });
  });

export const Route = createFileRoute("/posts/$id")({
  loader: ({ params }) => getPost({ data: { id: params.id } }),
  component: PostPage,
});

function PostPage() {
  const post = Route.useLoaderData();
  return <h1>{post.title}</h1>;
}
```

**AlabJS**
```ts
// app/posts/[id]/post.server.ts
import { defineServerFn } from "alabjs";

export const getPost = defineServerFn(
  z.object({ id: z.string() }),
  async ({ id }) => db.posts.findUnique({ where: { id } })
);
```

```tsx
// app/posts/[id]/page.tsx
import { useServerData, useParams } from "alabjs";
import { getPost } from "./post.server";

export const ssr = true;

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const post = useServerData(() => getPost({ id }));
  return <h1>{post.title}</h1>;
}
```

---

## Server functions

### Basic server function

**TanStack Start**
```ts
import { createServerFn } from "@tanstack/start";

const getUser = createServerFn({ method: "GET" })
  .handler(async () => {
    return db.users.findFirst();
  });
```

**AlabJS**
```ts
// user.server.ts
import { defineServerFn } from "alabjs";

export const getUser = defineServerFn(async () => {
  return db.users.findFirst();
});
```

The key difference: AlabJS enforces the `.server.ts` file name at the compiler level. TanStack Start uses a runtime check. In AlabJS, importing a `.server.ts` file from a client context is a **build error**, not a runtime error.

### With validation

**TanStack Start**
```ts
const createPost = createServerFn({ method: "POST" })
  .validator(z.object({ title: z.string() }))
  .handler(async ({ data }) => {
    return db.posts.create({ data: { title: data.title } });
  });
```

**AlabJS**
```ts
// create-post.server.ts
export const createPost = defineServerFn(
  z.object({ title: z.string() }),
  async ({ title }) => {
    return db.posts.create({ data: { title } });
  }
);
```

---

## Mutations

**TanStack Start** — uses TanStack Query `useMutation`:
```tsx
import { useMutation } from "@tanstack/react-query";
import { createPost } from "../server/create-post";
import { useRouter } from "@tanstack/react-router";

function NewPostForm() {
  const router = useRouter();
  const { mutate, isPending } = useMutation({
    mutationFn: (title: string) => createPost({ data: { title } }),
    onSuccess: () => router.invalidate(),
  });

  return (
    <button onClick={() => mutate("New Post")} disabled={isPending}>
      Create
    </button>
  );
}
```

**AlabJS** — built-in `useMutation`:
```tsx
import { useMutation } from "alabjs";
import { createPost } from "./create-post.server";

export default function NewPostForm() {
  const { mutate, status } = useMutation(createPost);

  return (
    <button
      onClick={() => mutate({ title: "New Post" })}
      disabled={status === "pending"}
    >
      Create
    </button>
  );
}
```

You can still use TanStack Query alongside AlabJS if you have an existing query setup — `useServerData` and TanStack Query are not mutually exclusive.

---

## API Routes

**TanStack Start**
```ts
// app/routes/api/posts.ts
import { createAPIFileRoute } from "@tanstack/start/api";

export const APIRoute = createAPIFileRoute("/api/posts")({
  GET: async () => {
    const posts = await db.posts.findMany();
    return Response.json(posts);
  },
});
```

**AlabJS** — plain `Request → Response` exports:
```ts
// app/api/posts/route.ts
export async function GET() {
  const posts = await db.posts.findMany();
  return Response.json(posts);
}
```

---

## Metadata / SEO

**TanStack Start**
```tsx
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { title: "My App" },
      { name: "description", content: "Welcome" },
    ],
  }),
});
```

**AlabJS**
```tsx
// any page.tsx or layout.tsx
export const metadata = {
  title: "My App",
  description: "Welcome",
  openGraph: { title: "My App" },
};

// Dynamic metadata
export async function generateMetadata({ params }: { params: { id: string } }) {
  const post = await db.posts.findUnique({ where: { id: params.id } });
  return { title: post.title };
}
```

---

## Environment variables

**TanStack Start** — Vite default prefix:
```
VITE_API_URL=https://api.example.com
```
```ts
import.meta.env.VITE_API_URL
```

**AlabJS** — rename `VITE_` to `ALAB_PUBLIC_`:
```
ALAB_PUBLIC_API_URL=https://api.example.com
```
```ts
import.meta.env.ALAB_PUBLIC_API_URL
```

Update your `env.d.ts`:
```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly ALAB_PUBLIC_API_URL?: string;
}
```

Server-only variables (no prefix) work identically in both frameworks.

---

## Navigation

**TanStack Start**
```tsx
import { Link, useNavigate } from "@tanstack/react-router";

<Link to="/posts/$id" params={{ id: "1" }}>View Post</Link>

const navigate = useNavigate();
navigate({ to: "/posts", search: { page: 2 } });
```

**AlabJS**
```tsx
import { Link, useNavigate } from "alabjs";

<Link href="/posts/1">View Post</Link>

const navigate = useNavigate();
navigate("/posts?page=2");
```

AlabJS also ships a code-based typed router if you want full type inference on `href` params — see the [routing docs](/routing).

---

## Caching

**TanStack Start** — TanStack Query handles client-side caching:
```ts
const getPost = createServerFn({ method: "GET" })
  .handler(async ({ data }) => db.posts.findUnique({ where: { id: data.id } }));

// In component:
const { data } = useSuspenseQuery({
  queryKey: ["post", id],
  queryFn: () => getPost({ data: { id } }),
  staleTime: 60_000,
});
```

**AlabJS** — caching is declared on the server function:
```ts
export const getPost = defineServerFn(
  z.object({ id: z.string() }),
  async ({ id }) => db.posts.findUnique({ where: { id } }),
  { cache: { ttl: 60, tags: ["posts"] } }
);
```

---

## What AlabJS adds that TanStack Start doesn't have

| Feature | AlabJS | TanStack Start |
|---|---|---|
| Rust compiler (oxc) | ✅ build-time boundary enforcement | ❌ Vinxi/Vite only |
| Partial Prerendering (PPR) | ✅ stable | ❌ not available |
| CDN Cache Headers | ✅ `cdnCache` export | manual |
| Skew Protection | ✅ automatic | manual |
| Built-in Analytics | ✅ `<Analytics />` | third-party |
| Built-in dev toolbar | ✅ zero config | ❌ |
| `ALAB_PUBLIC_` enforcement | ✅ compile-time | runtime only |

---

## Quick reference

| Task | TanStack Start | AlabJS |
|---|---|---|
| Define a route | `createFileRoute('/path')({})` | `app/path/page.tsx` default export |
| Dynamic segment | `$id` in filename | `[id]` in directory name |
| Root layout | `__root.tsx` + `createRootRoute` | `app/layout.tsx` default export |
| Read params | `Route.useParams()` | `useParams()` |
| Server function | `createServerFn().handler()` | `defineServerFn()` in `.server.ts` |
| Load data | `loader` on route | `useServerData(fn)` |
| Mutate data | `useMutation` (TanStack Query) | `useMutation(serverFn)` |
| API route | `createAPIFileRoute` | `route.ts` with `GET`/`POST` exports |
| Client env var | `VITE_` prefix | `ALAB_PUBLIC_` prefix |
| Enable SSR | default | `export const ssr = true` |
| Cache server data | TanStack Query `staleTime` | `defineServerFn(fn, { cache: { ttl } })` |
