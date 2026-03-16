import { defineServerFn } from "alabjs/server";
import { POSTS } from "./_data";

export type { Post } from "./_data";

export const getPosts = defineServerFn(async (_ctx) =>
  POSTS.map(({ id, title, excerpt, author, publishedAt, readingTime }) => ({
    id, title, excerpt, author, publishedAt, readingTime,
  })),
);

export const getPost = defineServerFn(async (_ctx, { id }: { id: string }) => {
  const post = POSTS.find((p) => p.id === id);
  if (!post) throw new Error(`Post not found: ${id}`);
  return post;
});
