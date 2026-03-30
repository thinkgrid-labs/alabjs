---
title: Routing
description: File-system routing, layouts, dynamic segments, middleware, and API routes.
---

# Routing

AlabJS uses a file-system router. Every `page.tsx` in the `app/` directory becomes a route. No config, no manual registration.

## Basic Routes

| File | Route |
|---|---|
| `app/page.tsx` | `/` |
| `app/about/page.tsx` | `/about` |
| `app/posts/page.tsx` | `/posts` |
| `app/posts/[id]/page.tsx` | `/posts/:id` |
| `app/posts/[id]/edit/page.tsx` | `/posts/:id/edit` |
| `app/[...slug]/page.tsx` | `/anything/deeply/nested` |

## Layouts

Place a `layout.tsx` in any directory. AlabJS automatically wraps child pages with the nearest parent layouts, outermost first.

```tsx
// app/layout.tsx — wraps every page
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900">
        {children}
      </body>
    </html>
  );
}
```

```tsx
// app/dashboard/layout.tsx — wraps /dashboard/* only
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

## Dynamic Segments

Use `[param]` folder names for dynamic routes. Params are passed to the page as props.

```tsx
// app/posts/[id]/page.tsx
export default function PostPage({ params }: { params: { id: string } }) {
  return <h1>Post {params.id}</h1>;
}
```

## Loading UI

Create `loading.tsx` in any directory to show a Suspense fallback while data loads.

```tsx
// app/posts/[id]/loading.tsx
export default function Loading() {
  return <div className="animate-pulse h-8 bg-gray-200 rounded" />;
}
```

## Error Boundaries

Create `error.tsx` to catch render errors in a subtree.

```tsx
// app/posts/[id]/error.tsx
export default function PostError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-8 text-center">
      <p className="text-red-600">{error.message}</p>
      <button onClick={reset} className="mt-4 btn">Try again</button>
    </div>
  );
}
```

## Not-Found Page

```tsx
// app/not-found.tsx
export default function NotFound() {
  return (
    <div className="p-8 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-gray-600">Page not found.</p>
    </div>
  );
}
```

## API Routes

Create `route.ts` in any directory to expose HTTP endpoints.

```ts
// app/api/posts/route.ts
export async function GET(req: Request): Promise<Response> {
  const posts = await db.posts.findAll();
  return Response.json(posts);
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  const post = await db.posts.create(body);
  return Response.json(post, { status: 201 });
}
```

Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`.

## Middleware

Create `middleware.ts` at the project root to run code before every request.

```ts
// middleware.ts
import { redirect, next } from "alabjs/middleware";

export async function middleware(req: Request) {
  const { pathname } = new URL(req.url);

  if (pathname.startsWith("/dashboard")) {
    const session = req.headers.get("cookie")?.includes("session");
    if (!session) return redirect("/login");
  }

  return next();
}

// Optional: restrict to specific paths
export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
```

## Live Routes

Name a file `*.live.tsx` to create a server-rendered real-time component at that path. Live files are scanned alongside page routes and included in the route manifest.

```
app/
  stock-ticker.live.tsx     ← live component, served via /_alabjs/live/<id>
  page.tsx                  ← regular page
```

Live components export `liveInterval` (seconds) and/or `liveTags` to control when the server pushes new HTML. See [Live Components](/live-components) for the full guide.

---

## Type-Safe Navigation

AlabJS generates a `AlabRoutes` TypeScript union from the route manifest at build time. Add `.alabjs/routes.d.ts` to your `tsconfig.json` to enable compile-time checks on every link.

```json
// tsconfig.json
{
  "include": ["app", ".alabjs/routes.d.ts"]
}
```

```tsx
import { RouteLink } from "alabjs/components";
import { navigate } from "alabjs/router";

// ✅ known static path
<RouteLink to="/about">About</RouteLink>

// ✅ known dynamic path — template literal
<RouteLink to={`/posts/${post.id}`}>Read post</RouteLink>

// ✗ build error: "/abuot" is not assignable to AlabRoutes
<RouteLink to="/abuot">Typo</RouteLink>
```

The Rust route checker also walks all `.tsx`/`.ts` source files and validates every `<RouteLink to>`, `<Link href>`, and `navigate()` string literal against the manifest. Unknown paths fail the build with the file path, character offset, and a close-match suggestion.

---

## i18n Routing

```ts
// i18n.ts
import { createI18nConfig } from "alabjs/i18n";

export const i18n = createI18nConfig({
  locales: ["en", "fil", "es"],
  defaultLocale: "en",
});
```

```ts
// middleware.ts
import { i18n } from "./i18n.js";
import { redirect, next } from "alabjs/middleware";

export async function middleware(req: Request) {
  const { pathname } = new URL(req.url);
  if (!i18n.hasLocalePrefix(pathname)) {
    return redirect(`/${i18n.detectLocale(req)}${pathname}`);
  }
  return next();
}
```

```tsx
// app/[locale]/layout.tsx
import { LocaleProvider } from "alabjs/i18n";

export default function LocaleLayout({ params, children }) {
  return <LocaleProvider locale={params.locale}>{children}</LocaleProvider>;
}
```
