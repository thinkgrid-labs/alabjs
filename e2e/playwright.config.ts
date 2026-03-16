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
      testMatch: "**/production.spec.ts",
      dependencies: ["build"],
    },
    {
      name: "build",
      testMatch: "**/build.spec.ts",
    },
  ],

  webServer: [
    {
      name: "dev",
      command: `node ../../packages/alabjs/dist/cli.js dev --port ${DEV_PORT}`,
      cwd: EXAMPLE_DIR,
      port: DEV_PORT,
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
      env: { NODE_ENV: "development" },
    },
    {
      name: "production",
      // Build first, then start the production server.
      // The build spec runs before production project via `dependencies`.
      command: `node ../../packages/alabjs/dist/cli.js start --port ${PROD_PORT}`,
      cwd: EXAMPLE_DIR,
      port: PROD_PORT,
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
      env: { NODE_ENV: "production" },
    },
  ],
});
