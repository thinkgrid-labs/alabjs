import { useServerData } from "alab/client";
import { Link } from "alab/components";
import type { getPost } from "./page.server";
import { Nav } from "../../nav";
import type { GenerateMetadata, PageMetadata } from "alab";

export const ssr = true;

// Dynamic per-post OG metadata — runs on the server before the render
export const generateMetadata: GenerateMetadata = async ({ params }) => {
  const titles: Record<string, string> = {
    "1": "Why Rust + React is the future",
    "2": "Alab: build with intensity",
    "3": "Server boundaries without magic",
  };
  const title = titles[params.id] ?? "Post";
  const meta: PageMetadata = {
    title: `${title} — Alab`,
    description: "Read this post on the Alab blog.",
    og: { title, description: "Read on Alab.", type: "article", siteName: "Alab" },
    twitter: { card: "summary_large_image", title },
  };
  return meta;
};

export default function PostPage({ params }: { params: { id: string } }) {
  const post = useServerData<typeof getPost>("getPost", { id: params.id });

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-14">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-zinc-400 mb-8">
          <Link href="/" className="hover:text-zinc-600 transition-colors">Home</Link>
          <span>/</span>
          <Link href="/posts" className="hover:text-zinc-600 transition-colors">Posts</Link>
          <span>/</span>
          <span className="text-zinc-600 truncate max-w-xs">{post.title}</span>
        </nav>

        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-3 py-1">
              {post.readingTime} min read
            </span>
            <span className="text-xs text-zinc-400">{post.publishedAt}</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 leading-tight mb-4">
            {post.title}
          </h1>
          <p className="text-lg text-zinc-500 leading-relaxed">{post.excerpt}</p>
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
            <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold">
              A
            </div>
            <span>{post.author}</span>
          </div>
        </header>

        {/* Body */}
        <article className="prose prose-zinc max-w-none">
          {post.body.split("\n\n").map((paragraph, i) => (
            <p key={i} className="text-zinc-700 leading-relaxed mb-5">
              {paragraph}
            </p>
          ))}
        </article>

        {/* Back */}
        <div className="mt-14 pt-8 border-t border-zinc-200">
          <Link
            href="/posts"
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-orange-500 transition-colors"
          >
            ← Back to posts
          </Link>
        </div>
      </main>
    </div>
  );
}
