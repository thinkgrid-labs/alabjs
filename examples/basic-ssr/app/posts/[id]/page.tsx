import { useServerData } from "alab/client";

export const ssr = true;

type Post = { id: string; title: string; body: string };

export default function PostPage({ params }: { params: { id: string } }) {
  const post = useServerData<Post>("getPost", params);

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
      <p>
        <a href="/posts">← Back to posts</a>
      </p>
    </article>
  );
}
