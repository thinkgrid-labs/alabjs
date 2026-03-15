import { useServerData } from "alab/client";
import type { getPost } from "./page.server";
import { Nav } from "../../nav";
import type { PageMetadata } from "alab";

export const ssr = true;

export async function generateMetadata(params: Record<string, string>): Promise<PageMetadata> {
  // Re-use the server function data for metadata — runs only on the server.
  const { getPost: getPostFn } = await import("./page.server.js");
  const post = await getPostFn({ params, query: {}, headers: {}, method: "GET", url: "" }, undefined);
  return {
    title: `${post.title} — Alab`,
    description: post.body.slice(0, 155),
    og: {
      title: post.title,
      description: post.body.slice(0, 155),
      type: "article",
      siteName: "Alab",
    },
    twitter: {
      card: "summary",
      title: post.title,
      description: post.body.slice(0, 155),
    },
  };
}

export default function PostPage({ params }: { params: { id: string } }) {
  const post = useServerData<typeof getPost>("getPost", params);

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-14">
        <a
          href="/posts"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors mb-10"
        >
          ← Back to posts
        </a>
        <article>
          <div className="mb-2 text-xs font-mono text-orange-500 uppercase tracking-widest">Post #{post.id}</div>
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 mb-6 leading-tight">{post.title}</h1>
          <div className="h-px bg-zinc-200 mb-8" />
          <p className="text-lg text-zinc-600 leading-relaxed">{post.body}</p>
        </article>
      </main>
    </div>
  );
}
