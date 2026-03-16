import { useServerData } from "alabjs/client";
import { Link, Dynamic } from "alabjs/components";
import type { getPosts } from "./page.server";
import { Nav } from "../nav";
import type { PageMetadata, CdnCache } from "alabjs";

export const ssr = true;

// PPR: pre-render the static shell (Nav + heading) at build time.
// The posts list streams in per-request inside <Dynamic>.
export const ppr = true;

// Cache the static shell at the CDN edge for 5 minutes.
export const cdnCache: CdnCache = {
  maxAge: 300,
  swr: 60,
  tags: ["posts"],
};

export const metadata: PageMetadata = {
  title: "Posts — AlabJS",
  description: "Thoughts on Rust, React, and building fast web applications.",
  og: {
    title: "Posts — AlabJS",
    description: "Thoughts on Rust, React, and building fast web applications.",
    type: "website",
    siteName: "AlabJS",
  },
  twitter: {
    card: "summary",
    title: "Posts — AlabJS",
    description: "Thoughts on Rust, React, and building fast web applications.",
  },
};

function PostsSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="h-3 w-24 bg-zinc-100 rounded mb-3" />
          <div className="h-5 w-3/4 bg-zinc-200 rounded mb-2" />
          <div className="h-3 w-full bg-zinc-100 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function PostsPage() {
  const posts = useServerData<typeof getPosts>("getPosts");

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 mb-2">Posts</h1>
        <p className="text-zinc-400 text-sm mb-10">Thoughts on Rust, React, and building fast.</p>
        {/* Dynamic: excluded from the pre-rendered static shell, streams in per-request */}
        <Dynamic id="posts-list" fallback={<PostsSkeleton />}>
        <div className="flex flex-col gap-4">
          {posts.map((post, i) => (
            <Link
              key={post.id}
              href={`/posts/${post.id}`}
              className="group rounded-xl border border-zinc-200 bg-white p-6 shadow-sm hover:border-orange-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-zinc-400 font-mono">#{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-xs text-zinc-400">·</span>
                    <span className="text-xs text-zinc-400">{post.readingTime} min read</span>
                    <span className="text-xs text-zinc-400">·</span>
                    <span className="text-xs text-zinc-400">{post.publishedAt}</span>
                  </div>
                  <h2 className="font-semibold text-zinc-900 text-lg group-hover:text-orange-500 transition-colors mb-1">
                    {post.title}
                  </h2>
                  <p className="text-zinc-500 text-sm leading-relaxed">{post.excerpt}</p>
                </div>
                <span className="text-zinc-300 group-hover:text-orange-400 transition-colors text-xl flex-shrink-0 mt-1">→</span>
              </div>
            </Link>
          ))}
        </div>
        </Dynamic>
      </main>
    </div>
  );
}
