#!/usr/bin/env node
/**
 * Alab CLI
 *
 * alab dev    — start the development server (Vite + Rust compiler)
 * alab build  — production build (Rust compile + Vite bundle)
 * alab start  — start the production HTTP server
 * alab info   — print the route manifest and compiler info
 */

import { parseArgs } from "node:util";
import { resolve } from "node:path";

const { positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string", short: "p", default: "3000" },
    host: { type: "string", default: "localhost" },
  },
});

const [command = "dev"] = positionals;
const cwd = process.cwd();

switch (command) {
  case "dev":
    await import("./commands/dev.js").then((m) => m.dev({ cwd }));
    break;
  case "build":
    await import("./commands/build.js").then((m) => m.build({ cwd }));
    break;
  case "start":
    await import("./commands/start.js").then((m) => m.start({ cwd }));
    break;
  case "info":
    await import("./commands/info.js").then((m) => m.info({ cwd }));
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error("Usage: alab <dev|build|start|info>");
    process.exit(1);
}
