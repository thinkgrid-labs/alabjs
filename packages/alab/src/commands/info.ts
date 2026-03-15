import { resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import type { AlabNapi } from "../types/napi.js";

interface InfoOptions {
  cwd: string;
}

/** Recursively find all files in a directory matching a predicate. */
async function findFiles(dir: string, match: (name: string) => boolean): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findFiles(full, match)));
    } else if (match(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

export async function info({ cwd }: InfoOptions) {
  let napi: AlabNapi;
  try {
    napi = (await import("@alab/compiler")) as AlabNapi;
  } catch {
    console.error(
      "  alab  Rust compiler not built. Run `cargo build --release -p alab-napi && bash scripts/copy-napi-binary.sh`.",
    );
    process.exit(1);
  }

  const appDir = resolve(cwd, "app");

  // ── Route manifest ────────────────────────────────────────────────────────
  const manifestJson = napi.buildRoutes(appDir);
  const manifest = JSON.parse(manifestJson) as {
    routes: Array<{ path: string; kind: string; ssr: boolean }>;
  };

  console.log("\n  alab  route manifest\n");
  if (manifest.routes.length === 0) {
    console.log("  (no routes found — add page.tsx files under app/)\n");
  } else {
    const rows = manifest.routes.map((r) => ({
      path: r.path,
      kind: r.kind,
      ssr: r.ssr ? "yes" : "no",
    }));
    console.table(rows);
  }

  // ── Server functions ──────────────────────────────────────────────────────
  const serverFiles = await findFiles(appDir, (n) => n.endsWith(".server.ts") || n.endsWith(".server.tsx"));

  if (serverFiles.length > 0) {
    console.log("  alab  server functions\n");

    let totalFns = 0;
    for (const file of serverFiles) {
      const source = await readFile(file, "utf8");
      const fnsJson = napi.extractServerFns(source, file);
      const fns = JSON.parse(fnsJson) as Array<{ name: string; endpoint: string }>;

      const rel = file.replace(appDir, "app");
      if (fns.length === 0) {
        console.log(`  ${rel}  (no defineServerFn exports)`);
      } else {
        for (const fn of fns) {
          console.log(`  ${rel}  ${fn.name}  →  POST ${fn.endpoint}`);
          totalFns++;
        }
      }
    }
    console.log(`\n  ${totalFns} server function${totalFns === 1 ? "" : "s"} across ${serverFiles.length} file${serverFiles.length === 1 ? "" : "s"}\n`);
  } else {
    console.log("  alab  no .server.ts files found\n");
  }

  // ── Boundary check ────────────────────────────────────────────────────────
  const pageFiles = await findFiles(
    appDir,
    (n) => (n.endsWith(".tsx") || n.endsWith(".ts")) && !n.includes(".server."),
  );

  let violationCount = 0;
  for (const file of pageFiles) {
    const source = await readFile(file, "utf8");
    const violationsJson = napi.checkBoundary(source, file);
    const violations = JSON.parse(violationsJson) as Array<{
      import: string;
      source: string;
      offset: number;
    }>;
    for (const v of violations) {
      if (violationCount === 0) console.log("  alab  boundary violations\n");
      console.log(`  ⚠ ${v.source.replace(appDir, "app")}  imports server module "${v.import}"`);
      violationCount++;
    }
  }
  if (violationCount > 0) {
    console.log(`\n  ${violationCount} violation${violationCount === 1 ? "" : "s"} — fix by using \`import type\` or removing runtime server imports\n`);
  }
}
