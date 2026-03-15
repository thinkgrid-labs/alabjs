// SSR enabled for this route
export const ssr = true;

export default function HomePage() {
  return (
    <main>
      <h1>Alab</h1>
      <p>
        Filipino for <em>blaze</em>. Full-stack React, powered by a Rust compiler.
      </p>
      <p>
        <a href="/posts">Browse posts →</a>
      </p>
    </main>
  );
}
