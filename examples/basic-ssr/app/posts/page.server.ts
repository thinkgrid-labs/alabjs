import { defineServerFn } from "alabjs/server";

export type Post = {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  author: string;
  publishedAt: string;
  readingTime: number;
};

// Fake data — replace with your DB/ORM
const POSTS: Post[] = [
  {
    id: "1",
    title: "Why Rust + React is the future",
    excerpt: "The combination of a zero-cost Rust compiler with React's component model creates something greater than the sum of its parts.",
    body: `Most front-end toolchains are written in JavaScript, which means they run in the same runtime they're compiling. That's a fundamental constraint.

Rust changes this. By compiling TypeScript with oxc — a Rust-native parser and transformer — Alab achieves cold starts under 100ms on large codebases. There's no JIT warmup, no garbage collector pauses.

On the React side, streaming SSR with renderToPipeableStream means the browser receives and renders HTML before the full data layer resolves. Users see content in under 200ms even on slow connections.

The combination is powerful: a compiler that never becomes the bottleneck, paired with a rendering model that meets the user where they are.`,
    author: "Alab Team",
    publishedAt: "2026-02-14",
    readingTime: 4,
  },
  {
    id: "2",
    title: "Alab: build with intensity",
    excerpt: "The framework born from the Philippines, named after the Tagalog word for blaze — because every keystroke should feel like fire.",
    body: `Alab is Filipino for blaze. That's not a marketing angle — it's a design philosophy.

Every default in the framework exists because it is the correct default. Security headers are set automatically because they should be. CSRF protection is on because it should be. Image optimization happens at the CDN layer because users shouldn't have to think about it.

The goal is a framework where the path of least resistance is also the path of best practice. No plugin archaeology. No config file archaeology. Just write React and let Alab handle the rest.`,
    author: "Alab Team",
    publishedAt: "2026-02-28",
    readingTime: 3,
  },
  {
    id: "3",
    title: "Server boundaries without magic",
    excerpt: "Explicit is better than implicit. Alab's server boundary system gives you the guarantees of React Server Components without the hidden rules.",
    body: `React Server Components are a great idea hamstrung by invisible rules. You can't use hooks in a server component. You can't import a client module from a server module without special annotations.

Alab takes a different approach. Server functions are defined explicitly with defineServerFn. The Rust compiler statically verifies that no server module is imported on the client. The boundary is opt-in and type-checked.

The result: the same isolation as RSC, with TypeScript errors instead of runtime surprises.`,
    author: "Alab Team",
    publishedAt: "2026-03-07",
    readingTime: 5,
  },
];

export const getPosts = defineServerFn(async () =>
  POSTS.map(({ id, title, excerpt, author, publishedAt, readingTime }) => ({
    id, title, excerpt, author, publishedAt, readingTime,
  })),
);

export const getPost = defineServerFn(async ({ id }: { id: string }) => {
  const post = POSTS.find((p) => p.id === id);
  if (!post) throw new Error(`Post not found: ${id}`);
  return post;
});
