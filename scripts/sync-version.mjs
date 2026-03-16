#!/usr/bin/env node
/**
 * Reads the version from the root package.json and writes it to:
 *  - packages/alabjs/package.json
 *  - packages/alabjs-vite-plugin/package.json
 *  - packages/create-alabjs/package.json
 *  - packages/alabjs-sync/package.json
 *  - crates/alab-napi/package.json
 *  - crates/alab-napi/npm/{platform}/package.json  (all platform packages)
 *  - Cargo.toml  (workspace [workspace.package] version)
 *
 * Usage:
 *   pnpm version:sync              # reads version from root package.json
 *   node scripts/sync-version.mjs 0.3.0   # sets explicit version
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";

// ── Read the canonical version ───────────────────────────────────────────────

// Accept an explicit version as a CLI argument (used by release.yml)
const cliVersion = process.argv[2];
const rootPkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
// Strip leading 'v' — git tags have it (v0.3.0-alpha.1) but npm and Cargo do not accept it.
const version = (cliVersion ?? rootPkg.version ?? "").replace(/^v/, "");
if (!version) throw new Error("No version field in root package.json");

// If an explicit version was passed, also update the root package.json
if (cliVersion) {
  rootPkg.version = cliVersion;
  writeFileSync(resolve(root, "package.json"), JSON.stringify(rootPkg, null, 2) + "\n", "utf8");
}
console.log(`Syncing version → ${version}`);

// ── JS packages ──────────────────────────────────────────────────────────────

const jsPaths = [
  "packages/alabjs/package.json",
  "packages/alabjs-vite-plugin/package.json",
  "packages/create-alabjs/package.json",
  "packages/alabjs-sync/package.json",
  "crates/alab-napi/package.json",
];

// Add all crates/alab-napi/npm/*/package.json entries dynamically.
const npmDir = resolve(root, "crates/alab-napi/npm");
for (const entry of readdirSync(npmDir)) {
  const pkgPath = resolve(npmDir, entry, "package.json");
  try {
    if (statSync(pkgPath).isFile()) {
      jsPaths.push(`crates/alab-napi/npm/${entry}/package.json`);
    }
  } catch {
    // skip missing entries
  }
}

for (const rel of jsPaths) {
  const abs = resolve(root, rel);
  const pkg = JSON.parse(readFileSync(abs, "utf8"));
  pkg.version = version;
  writeFileSync(abs, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log(`  updated ${rel}`);
}

// ── Cargo.toml workspace version ─────────────────────────────────────────────

const cargoPath = resolve(root, "Cargo.toml");
let cargo = readFileSync(cargoPath, "utf8");

// Replace the version line inside [workspace.package].
// Matches: version = "x.y.z"  (standalone line, not version.workspace = true)
cargo = cargo.replace(
  /^(version\s*=\s*)"[^"]*"/m,
  `$1"${version}"`,
);

writeFileSync(cargoPath, cargo, "utf8");
console.log(`  updated Cargo.toml`);

console.log(`Done. All packages are now at v${version}.`);
