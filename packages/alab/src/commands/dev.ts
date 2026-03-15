import { createServer } from "vite";
import { resolve } from "node:path";

interface DevOptions {
  cwd: string;
  port?: number;
  host?: string;
}

export async function dev({ cwd, port = 3000, host = "localhost" }: DevOptions) {
  console.log("  alab  starting dev server...\n");

  const vite = await createServer({
    root: cwd,
    server: { port, host },
    plugins: [
      // alab-vite-plugin wires Rust compiler into Vite's transform pipeline
      (await import("alab-vite-plugin")).alabPlugin(),
    ],
  });

  await vite.listen();
  vite.printUrls();
}
