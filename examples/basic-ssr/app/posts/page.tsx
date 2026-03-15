import { useServerData } from "alab/client";

export const ssr = true;

type Post = { id: string; title: string; excerpt: string };

export default function PostsPage() {
  const posts = useServerData<Post[]>("getPosts");

  return (
    <main>
      <h1>Posts</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            <a href={`/posts/${post.id}`}>
              <strong>{post.title}</strong>
            </a>
            <p>{post.excerpt}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
