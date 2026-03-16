import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const EXAMPLE_DIR = resolve(__dirname, "../examples/basic-ssr");
const DEV_PORT  = 3100;
const PROD_PORT = 3101;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // dev + prod servers share ports — run serially
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: process.env["CI"] ? "github" : "list",

  use: {
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "dev",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${DEV_PORT}` },
      testMatch: "**/dev.spec.ts",
    },
    {
      name: "production",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PROD_PORT}` },
      testMatch: ["**/production.spec.ts", "**/data-flow.spec.ts"],
      dependencies: ["build"],
    },
    {
      name: "build",
      testMatch: "**/build.spec.ts",
    },
  ],

  webServer: [
    // The dev webServer is excluded in CI entirely — Playwright starts every
    // entry in this array unconditionally, so leaving it in would attempt a
    // cold Rust+TS compile on every CI run and time out.
    // In local dev it is included so `playwright test --project=dev` works.
    ...(process.env["CI"]
      ? []
      : [
          {
            name: "dev",
            command: `node ../../packages/alabjs/dist/cli.js dev --port ${DEV_PORT}`,
            cwd: EXAMPLE_DIR,
            port: DEV_PORT,
            reuseExistingServer: true,
            timeout: 60_000,
            env: { NODE_ENV: "development" },
          },
        ]),
    {
      name: "production",
      // Chain build → start so the server is always self-contained.
      // `--skip-typecheck` keeps CI fast (tsc runs separately in the typecheck job).
      command: `node ../../packages/alabjs/dist/cli.js build --skip-typecheck && node ../../packages/alabjs/dist/cli.js start --port ${PROD_PORT}`,
      cwd: EXAMPLE_DIR,
      port: PROD_PORT,
      reuseExistingServer: !process.env["CI"],
      // 180 s in CI: alab build (Rolldown SSR + SW bundle) + server cold start.
      timeout: process.env["CI"] ? 180_000 : 60_000,
      env: { NODE_ENV: "production" },
    },
  ],
});
