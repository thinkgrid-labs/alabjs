import { resolve } from "node:path";

interface InfoOptions {
  cwd: string;
}

export async function info({ cwd }: InfoOptions) {
  // Dynamically load the napi binding to print compiler info
  let napi: typeof import("alab-napi");
  try {
    napi = await import("alab-napi");
  } catch {
    console.error("  alab  Rust compiler not built. Run `pnpm --filter alab-napi build`.");
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
