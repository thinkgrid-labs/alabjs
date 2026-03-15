import { AlabProvider } from "alabjs/client";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Alab — Basic SSR Example</title>
        <style>{`
          body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
          nav a { margin-right: 1rem; }
        `}</style>
      </head>
      <body>
        <nav>
          <a href="/">Home</a>
          <a href="/posts">Posts</a>
        </nav>
        <AlabProvider fallback={<p>Loading…</p>}>{children}</AlabProvider>
      </body>
    </html>
  );
}
