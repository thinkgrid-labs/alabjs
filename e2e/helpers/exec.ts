import { execSync, type ExecSyncOptions } from "node:child_process";
import { resolve } from "node:path";

export const EXAMPLE_DIR = resolve(__dirname, "../../examples/basic-ssr");
export const CLI = resolve(__dirname, "../../packages/alabjs/dist/cli.js");

/** Run a command synchronously in the example directory. Throws on non-zero exit. */
export function run(cmd: string, opts: ExecSyncOptions = {}): string {
  return execSync(cmd, {
    cwd: EXAMPLE_DIR,
    encoding: "utf8",
    stdio: "pipe",
    ...opts,
  });
}
