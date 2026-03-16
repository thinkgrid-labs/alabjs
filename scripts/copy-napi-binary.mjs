#!/usr/bin/env node
// Cross-platform version of copy-napi-binary.sh
// Works on Windows, macOS, and Linux.

import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const platform = process.platform; // 'darwin' | 'linux' | 'win32'
const arch = process.arch;         // 'x64' | 'arm64'
// fileURLToPath handles Windows paths correctly (e.g. file:///C:/... → C:\...)
const root = fileURLToPath(new URL("..", import.meta.url));

const TARGET_DIR = resolve(root, "crates/alab-napi");

const map = {
  "darwin-arm64": { src: "target/release/libalab_napi.dylib", dest: "alab-napi.darwin-arm64.node" },
  "darwin-x64":   { src: "target/release/libalab_napi.dylib", dest: "alab-napi.darwin-x64.node" },
  "linux-x64":    { src: "target/release/libalab_napi.so",    dest: "alab-napi.linux-x64-gnu.node" },
  "linux-arm64":  { src: "target/release/libalab_napi.so",    dest: "alab-napi.linux-arm64-gnu.node" },
  "win32-x64":    { src: "target/release/alab_napi.dll",      dest: "alab-napi.win32-x64-msvc.node" },
};

const key = `${platform}-${arch}`;
const entry = map[key];

if (!entry) {
  console.error(`Unsupported platform: ${key}`);
  process.exit(1);
}

const src  = resolve(root, entry.src);
const dest = resolve(TARGET_DIR, entry.dest);

if (!existsSync(src)) {
  console.error(`Binary not found at ${src}`);
  console.error("Run: cargo build --release -p alab-napi");
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`Copied ${src} → ${dest}`);
