import { resolve } from "node:path";
import { createApp } from "../server/app.js";
import type { RouteManifest } from "../router/manifest.js";

interface StartOptions {
  cwd: string;
  port?: number;
}

export async function start({ cwd, port = 3000 }: StartOptions) {
  const manifestPath = resolve(cwd, ".alab/route-manifest.json");

  let manifest: RouteManifest;
  try {
    const { readFileSync } = await import("node:fs");
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RouteManifest;
  } catch {
    console.error("  alab  no build found. Run `alab build` first.");
    process.exit(1);
  }

  const distDir = resolve(cwd, ".alab/dist");
  const app = createApp(manifest, distDir);
  app.listen(port);
}
