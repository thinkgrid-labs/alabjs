import { build as viteBuild } from "vite";
import { resolve } from "node:path";

interface BuildOptions {
  cwd: string;
}

export async function build({ cwd }: BuildOptions) {
  console.log("  alab  building for production...\n");

  await viteBuild({
    root: cwd,
    plugins: [
      (await import("alab-vite-plugin")).alabPlugin({ mode: "build" }),
    ],
    build: {
      outDir: resolve(cwd, ".alab/dist"),
      ssrManifest: true,
    },
  });

  console.log("\n  alab  build complete → .alab/dist");
}
