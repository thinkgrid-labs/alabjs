import { resolve } from "node:path";
import type { AlabNapi } from "../types/napi.js";

interface InfoOptions {
  cwd: string;
}

export async function info({ cwd }: InfoOptions) {
  let napi: AlabNapi;
  try {
    napi = (await import("@alab/compiler")) as AlabNapi;
  } catch {
    console.error("  alab  Rust compiler not built. Run `cargo build --release -p alab-napi && bash scripts/copy-napi-binary.sh`.");
    process.exit(1);
  }

  const appDir = resolve(cwd, "app");
  const manifestJson = napi.buildRoutes(appDir);
  const manifest = JSON.parse(manifestJson) as { routes: Array<{ path: string; kind: string; ssr: boolean }> };

  console.log("\n  alab  route manifest\n");
  const rows = manifest.routes.map((r) => ({
    path: r.path,
    kind: r.kind,
    ssr: r.ssr ? "yes" : "no",
  }));
  console.table(rows);
  console.log();
}
