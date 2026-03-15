import { resolve } from "node:path";
import { createApp } from "../server/app.js";
import type { RouteManifest } from "../router/manifest.js";

interface StartOptions {
  cwd: string;
  port?: number;
}

export async function start({ cwd, port = 3000 }: StartOptions) {
  const manifestPath = resolve(cwd, ".alabjs/route-manifest.json");

  let manifest: RouteManifest;
  try {
    const { readFileSync } = await import("node:fs");
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RouteManifest;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      console.error("  alab  no build found. Run `alab build` first.");
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  alab  failed to load route manifest: ${msg}`);
      console.error("  alab  try running `alab build` again.");
    }
    process.exit(1);
  }

  const distDir = resolve(cwd, ".alabjs/dist");
  const app = createApp(manifest, distDir);
  app.listen(port);
}
