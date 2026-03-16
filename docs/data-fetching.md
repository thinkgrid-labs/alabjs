---
title: Data Fetching
description: Fetch server data in components with useServerData and Suspense.
---

AlabJS fetches data through server functions — typed TypeScript functions that run on the server and are automatically called from the client via a type-safe RPC layer. There is no `useEffect` data fetching, no manual API wiring.

## Defining a server function for data

```ts
// app/posts/page.server.ts
import { defineServerFn } from "alabjs/server";

type Post = { id: number; title: string; body: string };

export const getPosts = defineServerFn(async () => {
  const res = await fetch("https://api.example.com/posts");
  if (!res.ok) throw new Error("Failed to fetch posts");
  return res.json() as Promise<Post[]>;
});
```

## Reading data in a component

`useServerData` calls a server function and returns the result. The component suspends while the data loads — wrap it in a `<Suspense>` boundary (or use the route's `loading.tsx`):

```tsx
// app/posts/page.tsx
import { useServerData } from "alabjs/client";
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
export const getPost = defineServerFn(async ({ id }: { id: string }) => {
  const res = await fetch(`https://api.example.com/posts/${id}`);
  if (!res.ok) throw new Error(`Post ${id} not found`);
  return res.json() as Promise<Post>;
});
```

```tsx
// page.tsx
function Post({ id }: { id: string }) {
  const post = useServerData(getPost, { id });
  return <h1>{post.title}</h1>;
}
```

## Server-side rendering

When `export const ssr = true` is set on the page, `useServerData` runs on the server during SSR. The data is inlined into the HTML and reused on the client — no double fetch.

```tsx
// page.tsx
export const ssr = true;

export default function PostsPage() {
  const posts = useServerData(getPosts); // runs on server during SSR
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

## Error handling

Errors thrown by server functions are caught by the nearest error boundary. Add an `error.tsx` file next to the page:

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

Fetch multiple resources in parallel using `Promise.all` inside a single server function:

```ts
// page.server.ts
export const getPostWithComments = defineServerFn(async ({ id }: { id: string }) => {
  const [post, comments] = await Promise.all([
    fetch(`https://api.example.com/posts/${id}`).then(r => r.json()),
    fetch(`https://api.example.com/posts/${id}/comments`).then(r => r.json()),
  ]);
  return { post, comments };
});
```

Or call `useServerData` in separate components within the same `<Suspense>` tree — React fires both requests concurrently:

```tsx
function PostPage({ id }: { id: string }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <PostBody id={id} />
      <CommentList id={id} />
    </Suspense>
  );
}
```

## Forwarding auth headers

Pass credentials from the incoming request to your API inside the server context:

```ts
// page.server.ts
export const getProfile = defineServerFn(async (_input, ctx) => {
  const res = await fetch("https://api.example.com/me", {
    headers: {
      Authorization: ctx.headers["authorization"] ?? "",
    },
  });
  if (res.status === 401) throw new Error("Unauthorized");
  return res.json();
});
```

## Caching and revalidation

For data that doesn't change on every request, cache it at the server function level:

```ts
export const getPosts = defineServerFn(
  async () => {
    const res = await fetch("https://api.example.com/posts");
    return res.json();
  },
  { cache: { ttl: 60, tags: ["posts"] } }, // cache 60 seconds
);
```

For page-level HTML caching, use ISR:

```tsx
export const revalidate = 300; // cache rendered HTML for 5 minutes
```

## API Reference

### `useServerData<T>(fn: ServerFn<void, T>): T`
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
});
```
