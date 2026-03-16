/**
 * Build lifecycle tests — `alab build`
 *
 * These tests run without a browser. They verify that the build step
 * produces the expected output artifacts before the production server starts.
 */

import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { run, EXAMPLE_DIR, CLI } from "../helpers/exec.js";

const dist = resolve(EXAMPLE_DIR, ".alabjs/dist");
const pprCache = resolve(EXAMPLE_DIR, ".alabjs/ppr-cache");

test.describe("alab build", () => {
  test.beforeAll(() => {
    // In CI the example is pre-built by the ci.yml pre-build step before
    // Playwright runs — skip rebuilding here to avoid redundant typecheck
    // overhead that can exceed the 120s execSync timeout on slow runners.
    // Locally, run the full build so this spec is self-contained.
    if (process.env["CI"]) return;
    run(`node ${CLI} build`, { timeout: 120_000 });
  });

  test("exits without error", () => {
    // If beforeAll didn't throw, the build exited 0.
    expect(true).toBe(true);
  });

  test("emits client bundle", () => {
    expect(existsSync(resolve(dist, "client"))).toBe(true);
  });

  test("emits server bundle", () => {
    expect(existsSync(resolve(dist, "server"))).toBe(true);
  });

  test("emits route-manifest.json", () => {
    const manifestPath = resolve(dist, "route-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      routes: Array<{ path: string; kind: string }>;
    };
    expect(manifest.routes.length).toBeGreaterThan(0);
    // Home page must be in the manifest as a page route.
    // (Layouts also resolve to "/" — find the page specifically.)
    const home = manifest.routes.find((r) => r.path === "/" && r.kind === "page");
    expect(home).toBeDefined();
    expect(home?.kind).toBe("page");
  });

  test("emits BUILD_ID file", () => {
    const idPath = resolve(dist, "BUILD_ID");
    expect(existsSync(idPath)).toBe(true);
    const id = readFileSync(idPath, "utf8").trim();
    expect(id.length).toBeGreaterThan(0);
  });

  test("emits offline service worker", () => {
    const swPath = resolve(dist, "client/_alabjs/offline-sw.js");
    expect(existsSync(swPath)).toBe(true);
  });

  test("pre-renders PPR shells for ppr=true pages", () => {
    // posts/page.tsx exports ppr=true — its shell must be in ppr-cache
    expect(existsSync(pprCache)).toBe(true);
    const postsShell = resolve(pprCache, "posts.html");
    expect(existsSync(postsShell)).toBe(true);

    const html = readFileSync(postsShell, "utf8");
    // Shell contains the static heading from PostsPage
    expect(html).toContain("Posts");
    // Shell contains ppr-hole placeholder for the Dynamic section
    expect(html).toContain("data-ppr-hole");
  });

  test("PPR shell contains data-ppr-hole with correct id", () => {
    const postsShell = resolve(pprCache, "posts.html");
    const html = readFileSync(postsShell, "utf8");
    expect(html).toContain('data-ppr-hole="posts-list"');
  });
});
