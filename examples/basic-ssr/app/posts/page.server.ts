import { defineServerFn } from "alab/server";

// Fake data — replace with your DB/ORM
const POSTS = [
  { id: "1", title: "Why Rust + React is the future", excerpt: "Building faster, together." },
  { id: "2", title: "Alab: build with intensity", excerpt: "The framework born from the Philippines." },
  { id: "3", title: "Server boundaries without magic", excerpt: "Explicit is better than implicit." },
];

export const getPosts = defineServerFn(async () => {
  return POSTS;
});
