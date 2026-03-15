---
title: Data Fetching
description: Fetch server data in components with useServerData and Suspense.
sidebar:
  order: 1
---

Alab fetches data through server functions — typed TypeScript functions that run on the server and are automatically called from the client via a type-safe RPC layer. There is no `fetch`, no REST endpoints to define, and no `useEffect` data fetching.

## Defining a server function for data

```ts
// app/posts/page.server.ts
import { defineServerFn } from "alab/server";
import { db } from "../../db";

export const getPosts = defineServerFn(async () => {
  return db.posts.findMany({ orderBy: { createdAt: "desc" } });
});
```

## Reading data in a component

`useServerData` calls a server function and returns the result. The component suspends while the data loads — wrap it in a `<Suspense>` boundary (or use the route's `loading.tsx`):

```tsx
// app/posts/page.tsx
import { useServerData } from "alab/client";
import { getPosts } from "./page.server";

export default function PostsPage() {
  return (
    <Suspense fallback={<p>Loading posts...</p>}>
      <PostList />
    </Suspense>
  );
}

function PostList() {
  const posts = useServerData(getPosts);

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

## Passing parameters

```ts
// page.server.ts
export const getPost = defineServerFn(async ({ slug }: { slug: string }) => {
  return db.posts.findFirst({ where: { slug } });
});
```

```tsx
// page.tsx
function Post({ slug }: { slug: string }) {
  const post = useServerData(getPost, { slug });
  return <h1>{post?.title}</h1>;
}
```

## Server-side rendering

When `export const ssr = true` is set on the page, `useServerData` runs on the server during SSR. The data is inlined into the HTML and reused on the client — no double fetch.

```tsx
// page.tsx
export const ssr = true;

export default function PostsPage() {
  const posts = useServerData(getPosts); // Runs on server during SSR
  return <ul>{posts.map(...)}</ul>;
}
```

## Error handling

Errors thrown by server functions during data fetching are caught by the nearest error boundary. Add an `error.tsx` file next to the page to handle them:

```tsx
// app/posts/error.tsx
export default function PostsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <p>Failed to load posts: {error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  );
}
```

## Parallel data fetching

Fetch multiple data sets in parallel using `Promise.all` inside a server function, or by calling `useServerData` multiple times in different components within the same `<Suspense>` tree:

```ts
// page.server.ts
export const getPageData = defineServerFn(async ({ id }: { id: string }) => {
  const [post, comments, related] = await Promise.all([
    db.posts.findFirst({ where: { id } }),
    db.comments.findMany({ where: { postId: id } }),
    db.posts.findMany({ where: { category: "tech" }, take: 5 }),
  ]);
  return { post, comments, related };
});
```

## Caching and revalidation

For pages where data doesn't change on every request, enable ISR:

```tsx
// Cache the rendered HTML for 5 minutes
export const revalidate = 300;
```

For server function-level caching, memoize the result inside the function using any in-memory or Redis cache.

## API Reference

### `useServerData<T>(fn: ServerFn<void, T>, ...args): T`
### `useServerData<T, I>(fn: ServerFn<I, T>, input: I): T`

React hook. Calls `fn` with `input` and returns the result. Suspends while pending. Uses React's cache for deduplication within a single render.

Returns the resolved value — never `undefined` (suspension handles the loading state).

### `defineServerFn<I, O>(handler): ServerFn<I, O>`

Defines a server function. `handler` receives the input and a context object:

```ts
defineServerFn(async (input, ctx) => {
  // input: the argument passed from the client
  // ctx.headers: Request headers
  // ctx.params: Route params
  // ctx.searchParams: URL search params
  // ctx.publicDir: Path to the project's /public directory
});
```
