---
title: SSR & CSR
description: Server-side rendering, client-side rendering, ISR, and metadata.
---

# SSR & CSR

AlabJS renders pages on the client by default. Add `export const ssr = true` to a page to switch it to server-side rendering.

## CSR (Default)

```tsx
// app/dashboard/page.tsx
// No export const ssr — renders on the client
export default function DashboardPage() {
  return <Dashboard />;
}
```

Client-rendered pages ship an empty HTML shell. The browser loads the JS bundle and mounts React. Good for interactive apps and authenticated pages that don't need search engine indexing.

## SSR (Opt-in)

```tsx
// app/posts/[id]/page.tsx
export const ssr = true; // renders on the server

export const metadata = {
  title: "Post",
  description: "Read this post",
};

export default function PostPage({ params }: { params: { id: string } }) {
  const post = useServerData<typeof getPost>("getPost", params);
  return <article><h1>{post.title}</h1></article>;
}
```

SSR pages:
- Stream real HTML from the server
- Have access to `useServerData` with Suspense
- Are indexed by search engines immediately
- Support `metadata` and `generateMetadata`

## Dynamic Metadata

```ts
// app/posts/[id]/page.tsx
export async function generateMetadata({ id }: { id: string }) {
  const post = await db.posts.findById(id);
  return {
    title: post.title,
    description: post.excerpt,
    og: { image: post.coverImage },
  };
}
```

## ISR (Incremental Static Regeneration)

Add `export const revalidate` to cache a page's rendered HTML and regenerate it in the background.

```tsx
// app/posts/page.tsx
export const ssr = true;
export const revalidate = 60; // cache for 60 seconds

export default function PostsPage() {
  const posts = useServerData<typeof getPosts>("getPosts");
  return <PostList posts={posts} />;
}
```

How it works:
1. First request renders and caches the HTML
2. Subsequent requests within the TTL get the cached HTML (`x-alabjs-cache: hit`)
3. After TTL, the next request gets stale HTML while a background re-render runs (`x-alabjs-cache: stale`)
4. Future requests get the freshly rendered HTML

To manually purge a cached page:

```ts
import { revalidatePath } from "alabjs/cache";

// Purge exact path
revalidatePath("/posts");

// Purge all paths under /posts
revalidatePathPrefix("/posts");
```

## Static Site Generation

Pre-render pages to static HTML files at build time:

```bash
alabjs ssg
```

For dynamic routes, export `generateStaticParams`:

```ts
// app/posts/[id]/page.tsx
export async function generateStaticParams() {
  const posts = await db.posts.findAll();
  return posts.map(p => ({ id: String(p.id) }));
}
```

`alabjs ssg` calls this, renders each combination, and writes HTML files to `.alabjs/dist/`.
