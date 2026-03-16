---
title: Server Functions
description: defineServerFn, useServerData, useMutation, caching, and Zod validation.
---

# Server Functions

Server functions are the primary way to run code on the server in AlabJS. They are defined in `.server.ts` files, enforced by the Rust compiler at build time — they never ship to the browser.

## Defining a Server Function

```ts
// app/posts/page.server.ts
import { defineServerFn } from "alabjs/server";

export const getPosts = defineServerFn(async () => {
  const res = await fetch("https://api.example.com/posts");
  return res.json() as Promise<{ id: number; title: string }[]>;
});

export const getPost = defineServerFn(async ({ id }: { id: string }) => {
  const res = await fetch(`https://api.example.com/posts/${id}`);
  return res.json() as Promise<{ id: number; title: string; body: string }>;
});
```

## Reading Data: `useServerData`

`useServerData` fetches data from a server function and suspends the component until it resolves. Use a `loading.tsx` or a manual `<Suspense>` boundary as the fallback.

```tsx
// app/posts/page.tsx
import { getPosts } from "./page.server";
import { useServerData } from "alabjs/client";

export const ssr = true; // render on server for SEO

export default function PostsPage() {
  const posts = useServerData(getPosts);

  return (
    <ul>
      {posts.map(p => <li key={p.id}>{p.title}</li>)}
    </ul>
  );
}
```

The return type of `getPosts` is inferred automatically. No manual type annotation needed.

## Mutations: `useMutation`

```tsx
import { createPost } from "./page.server";
import { useMutation } from "alabjs/client";

export default function NewPostForm() {
  const { mutate, isPending, error, isSuccess, reset } = useMutation(createPost);

  return (
    <form onSubmit={e => {
      e.preventDefault();
      mutate({ title: e.currentTarget.title.value });
    }}>
      <input name="title" />
      <button disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </button>
      {error && <p className="text-red-600">{error.message}</p>}
    </form>
  );
}
```

### Optimistic Updates

```tsx
const { mutate, optimisticData } = useMutation(toggleLike, {
  optimistic: (input) => ({ ...currentPost, liked: input.liked }),
  onError: (_err, rollback) => rollback(),
});
```

## Zod Validation

Pass a Zod schema as the first argument. Invalid input returns HTTP 422 with structured errors — the handler is never called with bad data.

```ts
// app/posts/page.server.ts
import { defineServerFn } from "alabjs/server";
import { z } from "zod";

const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(10),
});

export const createPost = defineServerFn(
  CreatePostSchema,
  async (input) => {
    const res = await fetch("https://api.example.com/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return res.json();
  },
);
```

```tsx
// On the client
const { mutate, zodError, isInvalid } = useMutation(createPost);

// zodError is the structured ZodError object when status === "invalid"
```

## Caching

Server function results can be cached in-process. Nothing is cached unless you explicitly ask.

```ts
export const getPopularPosts = defineServerFn(
  async () => {
    const res = await fetch("https://api.example.com/posts?sort=popular");
    return res.json();
  },
  {
    cache: {
      ttl: 60,            // seconds
      tags: ["posts"],    // for group invalidation
    },
  },
);
```

Invalidate from another server function or API route:

```ts
import { invalidateCache } from "alabjs/cache";

// Invalidate everything tagged "posts"
invalidateCache({ tags: ["posts"] });

// Invalidate a specific cache key
invalidateCacheKey("getPopularPosts:undefined");
```

## Server Context

Every server function receives a context object as its first argument:

```ts
export const getUser = defineServerFn(async ({ params, query, headers, method, url }) => {
  const token = headers["authorization"];
  const res = await fetch("https://api.example.com/me", {
    headers: { Authorization: token ?? "" },
  });
  return res.json();
});
```

| Property | Type | Description |
|---|---|---|
| `params` | `Record<string, string>` | URL path parameters |
| `query` | `Record<string, string>` | URL search parameters |
| `headers` | `Record<string, string>` | Request headers |
| `method` | `"GET" \| "POST"` | HTTP method |
| `url` | `string` | Raw request URL |
