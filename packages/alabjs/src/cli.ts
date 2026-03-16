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

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string", short: "p", default: "3000" },
    host: { type: "string", default: "localhost" },
    "skip-typecheck": { type: "boolean", default: false },
    mode: { type: "string" },
    analyze: { type: "boolean", default: false },
    watch: { type: "boolean", default: false },
    ui: { type: "boolean", default: false },
    /** Target a specific app directory — useful in monorepos. e.g. `--cwd apps/marketing` */
    cwd: { type: "string", short: "C" },
  },
});

const [command = "dev"] = positionals;
// Resolve --cwd relative to wherever the CLI was invoked.
// Falls back to process.cwd() when omitted (standard single-app behaviour).
const cwd = values["cwd"] ? resolve(process.cwd(), values["cwd"]) : process.cwd();

switch (command) {
  case "dev":
    await import("./commands/dev.js").then((m) => m.dev({ cwd }));
    break;
  case "build": {
    const buildMode = values["mode"];
    await import("./commands/build.js").then((m) =>
      m.build({
        cwd,
        skipTypecheck: values["skip-typecheck"],
        mode: buildMode === "spa" ? "spa" : "ssr",
        analyze: values["analyze"],
      }),
    );
    break;
  }
  case "start":
    await import("./commands/start.js").then((m) => m.start({ cwd }));
    break;
  case "info":
    await import("./commands/info.js").then((m) => m.info({ cwd }));
    break;
  case "ssg":
    await import("./commands/ssg.js").then((m) => m.ssg({ cwd }));
    break;
  case "test":
    await import("./commands/test.js").then((m) =>
      m.test({
        cwd,
        watch: values["watch"],
        ui: values["ui"],
        files: positionals.slice(1),
      }),
    );
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error("Usage: alab <dev|build|start|info|ssg|test>");
    process.exit(1);
}
