import { useServerData } from "alab/client";
import { Link } from "alab/components";
import type { getPosts } from "./page.server";
import { Nav } from "../nav";
import type { PageMetadata } from "alab";

export const ssr = true;

// Cache the rendered HTML for 60 s — stale-while-revalidate in background
export const revalidate = 60;

export const metadata: PageMetadata = {
  title: "Posts — Alab",
  description: "Thoughts on Rust, React, and building fast web applications.",
  og: {
    title: "Posts — Alab",
    description: "Thoughts on Rust, React, and building fast web applications.",
    type: "website",
    siteName: "Alab",
  },
  twitter: {
    card: "summary",
    title: "Posts — Alab",
    description: "Thoughts on Rust, React, and building fast web applications.",
  },
};

export default function PostsPage() {
  const posts = useServerData<typeof getPosts>("getPosts");

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 mb-2">Posts</h1>
        <p className="text-zinc-400 text-sm mb-10">Thoughts on Rust, React, and building fast.</p>
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
      </main>
    </div>
  );
}
