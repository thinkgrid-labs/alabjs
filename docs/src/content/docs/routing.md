---
title: Routing
description: File-based routing in Alab.
---

Alab uses file-based routing. Files in `app/` map directly to URL paths.

## File conventions

| File | Route |
|------|-------|
| `app/page.tsx` | `/` |
| `app/about/page.tsx` | `/about` |
| `app/posts/[slug]/page.tsx` | `/posts/:slug` |
| `app/users/[id]/settings/page.tsx` | `/users/:id/settings` |

## Page component

Every route exports a default React component:

```tsx
export default function AboutPage() {
  return <h1>About</h1>;
}
```

## Metadata

Export a `metadata` object for SEO:

```tsx
import type { PageMetadata } from "alab";

export const metadata: PageMetadata = {
  title: "About Us",
  description: "Learn more about our team.",
};
```

## Dynamic routes

Use `[param]` folders for dynamic segments:

```tsx
// app/posts/[slug]/page.tsx
import type { AlabPage } from "alab";

const PostPage: AlabPage<"/posts/[slug]"> = ({ params }) => {
  return <h1>{params.slug}</h1>;
};

export default PostPage;
```
