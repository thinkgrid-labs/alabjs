---
title: "Guide: Full-Stack App with SEO"
description: Build a production full-stack React app with server rendering, SEO, API routes, and a Node.js server.
---

# Building a Full-Stack App with SEO

This guide walks through building a full-stack AlabJS application with server-side rendering, SEO metadata, API routes, a Node.js production server, and deployment to a VPS or Fly.io.

## When to Use This Setup

This is the right approach when:

- Pages need to be indexed by search engines
- You are building a public-facing website, blog, e-commerce store, or marketing site
- Social media previews need to show real content from Open Graph tags
- You need a high Lighthouse score for SEO ranking

## Project Setup

```bash
npx create-alabjs@latest my-app --template blog
cd my-app
pnpm install
pnpm dev
```

## Project Structure

```
my-app/
├── app/
│   ├── layout.tsx              ← HTML shell (html, head, body)
│   ├── not-found.tsx           ← 404 page
│   ├── page.tsx                ← / (home, SSR, SEO metadata)
│   ├── page.server.ts
│   ├── blog/
│   │   ├── layout.tsx          ← /blog/* layout
│   │   ├── page.tsx            ← /blog listing
│   │   ├── page.server.ts
│   │   └── [slug]/
│   │       ├── page.tsx        ← /blog/:slug (SSR, dynamic OG)
│   │       └── page.server.ts
│   └── api/
│       └── contact/
│           └── route.ts        ← POST /api/contact
├── middleware.ts
└── package.json
```

## Root Layout

The root layout provides the HTML shell for every page.

```tsx
// app/layout.tsx
import { Font } from "alabjs/components";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Font family="Inter" weights={[400, 500, 700]} />
      </head>
      <body className="bg-white text-gray-900 antialiased">
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
```

## Pages with SSR and SEO

```tsx
// app/page.tsx
import type { getHomepageData } from "./page.server";
import { useServerData } from "alabjs/client";

export const ssr = true;

export const metadata = {
  title: "My Blog — Thoughts on software and design",
  description: "Articles on React, TypeScript, and building great software.",
  canonical: "https://myblog.com",
  og: {
    title: "My Blog",
    description: "Thoughts on software and design.",
    image: "/og/home.png",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function HomePage() {
  const { featured, recent } = useServerData<typeof getHomepageData>("getHomepageData");

  return (
    <main>
      <HeroSection post={featured} />
      <RecentPosts posts={recent} />
    </main>
  );
}
```

## Dynamic Metadata per Route

```tsx
// app/blog/[slug]/page.tsx
import type { getPost } from "./page.server";
import { useServerData } from "alabjs/client";

export const ssr = true;

// Called once per request — return type matches the metadata object
export async function generateMetadata({ slug }: { slug: string }) {
  const post = await getPost({ params: { slug } }, undefined);
  return {
    title: `${post.title} — My Blog`,
    description: post.excerpt,
    canonical: `https://myblog.com/blog/${slug}`,
    og: {
      title: post.title,
      description: post.excerpt,
      image: post.coverImage ?? "/og/default.png",
      type: "article",
    },
    twitter: { card: "summary_large_image" },
  };
}

export default function PostPage({ params }: { params: { slug: string } }) {
  const post = useServerData<typeof getPost>("getPost", params);

  return (
    <article className="prose mx-auto py-16">
      <h1>{post.title}</h1>
      <p className="text-gray-500">{post.publishedAt}</p>
      <div dangerouslySetInnerHTML={{ __html: post.body }} />
    </article>
  );
}
```

## Server Functions

```ts
// app/blog/[slug]/page.server.ts
import { defineServerFn } from "alabjs/server";

export const getPost = defineServerFn(async ({ params }) => {
  const post = await db.posts.findBySlug(params.slug);
  if (!post) throw new Error("Post not found");
  return post;
});
```

## ISR — Cache Popular Pages

Pages that change infrequently should be cached with ISR to reduce database load.

```tsx
// app/blog/page.tsx
export const ssr = true;
export const revalidate = 300; // re-render every 5 minutes

export default function BlogListPage() {
  const posts = useServerData<typeof getPosts>("getPosts");
  return <PostList posts={posts} />;
}
```

## API Routes

```ts
// app/api/contact/route.ts
import { z } from "zod";

const ContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(10),
});

export async function POST(req: Request): Promise<Response> {
  const body = ContactSchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error }, { status: 422 });
  }

  await sendEmail(body.data);
  return Response.json({ ok: true });
}
```

## Auto Sitemap

AlabJS generates `/sitemap.xml` automatically from the route manifest. No configuration needed.

For static routes, every `page.tsx` is included. For dynamic routes, implement `generateStaticParams`:

```ts
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const slugs = await db.posts.findAllSlugs();
  return slugs.map(slug => ({ slug }));
}
```

## Image Optimization

```tsx
import { Image } from "alabjs/components";

<Image
  src={post.coverImage}
  alt={post.title}
  width={1200}
  height={630}
  priority  // above the fold — preloads
  className="w-full rounded-lg"
/>
```

AlabJS converts images to WebP at request time, generates `srcset`, and serves them through the built-in `/_alabjs/image` endpoint. No external CDN or service required.

## Production Build

```bash
alabjs build     # compiles TypeScript, bundles with Vite 8 + Rolldown
alabjs start     # starts the H3 production server
```

By default, `alabjs start` listens on port 3000. Set `PORT` to override.

## Deployment: Node.js VPS / Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm
RUN pnpm install
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

## Deployment: Fly.io

```bash
fly launch
# Follow the prompts — Fly detects Node.js automatically
fly deploy
```

## Deployment: Cloudflare Workers

```ts
// alabjs.config.ts (planned)
import { defineConfig } from "alabjs";
export default defineConfig({ adapter: "cloudflare" });
```

```bash
alabjs build --adapter cloudflare
wrangler deploy
```

The Cloudflare adapter produces a `_worker.js` bundle compatible with the Workers runtime.

## Checklist: Production SEO

Before launching, verify:

- [ ] Every public page has a unique `<title>` and `<meta name="description">`
- [ ] OG images are 1200×630px and publicly accessible
- [ ] `/sitemap.xml` returns valid XML with all public routes
- [ ] `generateStaticParams` is implemented for all dynamic SSR pages
- [ ] `export const ssr = true` is on all pages that need to be indexed
- [ ] `export const revalidate` is set on pages with frequently changing data
- [ ] Canonical URLs are set correctly for paginated or duplicated content
- [ ] Lighthouse Performance score ≥ 90 (run `npx lighthouse https://yourdomain.com`)
