---
title: Server Functions
description: defineServerFn — type-safe server-only logic.
---

Server functions let you write server-side logic (DB queries, auth checks, file reads) that is fully type-safe on the client — without any API route boilerplate.

## Defining a server function

Create a `.server.ts` file alongside your page:

```ts
// app/posts/[slug]/page.server.ts
import { defineServerFn } from "alab/server";

export const getPost = defineServerFn(async ({ params }) => {
  const post = await db.posts.findBySlug(params.slug);
  return post;
});
```

## Using a server function

```tsx
// app/posts/[slug]/page.tsx
import type { AlabPage } from "alab";
import type { getPost } from "./page.server";   // ← import type only
import { useServerData } from "alab/client";

const PostPage: AlabPage<"/posts/[slug]"> = ({ params }) => {
  const post = useServerData<typeof getPost>("getPost", params);
  return <h1>{post.title}</h1>;
};

export default PostPage;
```

## How it works

At build time the Alab Rust compiler:

1. Scans `.server.ts` files for `defineServerFn` exports
2. Registers `POST /_alab/fn/<name>` handlers on the server
3. **Replaces** the handler body in client bundles with a thin `fetch` stub

Server code — DB connections, secrets, Node.js APIs — **never ships to the browser**.

## Boundary enforcement

Attempting a runtime import of a `.server.ts` module in a client file is a **compile-time error**:

```ts
// ❌ Build error — cannot import server module in client context
import { getPost } from "./page.server";

// ✅ OK — type-only import is erased at compile time
import type { getPost } from "./page.server";
```
