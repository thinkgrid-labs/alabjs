import { defineServerFn } from "alabjs/server";
import { POSTS } from "../_data";

export type { Post } from "../_data";

export const getPost = defineServerFn(async (_ctx, { id }: { id: string }) => {
  // Validate that id is a non-empty string before lookup
  if (!id || typeof id !== "string" || id.trim() === "") {
    throw new Error("Invalid post ID");
  }
  const post = POSTS.find((p) => p.id === id);
  if (!post) throw new Error(`Post not found: ${id}`);
  return post;
});
