import { defineServerFn } from "alab/server";

const POSTS: Record<string, { id: string; title: string; body: string }> = {
  "1": { id: "1", title: "Why Rust + React is the future", body: "Rust gives us speed. React gives us DX. Alab gives you both." },
  "2": { id: "2", title: "Alab: build with intensity", body: "Alab is the Filipino word for blaze. We believe your toolchain should match your passion." },
  "3": { id: "3", title: "Server boundaries without magic", body: "In Alab, server modules are explicit. No RSC magic — just TypeScript types and file conventions enforced by the Rust compiler." },
};

export const getPost = defineServerFn(async ({ params }) => {
  const post = POSTS[params.id];
  if (!post) throw new Error(`Post not found: ${params.id}`);
  return post;
});
