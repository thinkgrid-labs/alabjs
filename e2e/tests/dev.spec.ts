/**
 * Dev server E2E tests — `alab dev`
 *
 * The Playwright web server config starts the dev server before these tests run.
 */

import { test, expect } from "@playwright/test";

test.describe("dev server — pages", () => {
  test("home page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/AlabJS|Alab/i);
    await expect(page.locator("h1")).toContainText(/build with/i);
  });

  test("posts list page renders SSR content", async ({ page }) => {
    await page.goto("/posts");
    await expect(page.locator("h1")).toContainText("Posts");
    // At least one post card should appear
    await expect(page.locator("a[href^='/posts/']").first()).toBeVisible();
  });

  test("individual post page renders", async ({ page }) => {
    await page.goto("/posts/1");
    await expect(page.locator("h1")).toBeVisible();
    // Breadcrumb back link
    await expect(page.locator("a[href='/posts']")).toBeVisible();
  });

  test("404 page returns not-found content", async ({ page }) => {
    const res = await page.goto("/this-does-not-exist");
    expect(res?.status()).toBe(404);
  });
});

test.describe("dev server — navigation", () => {
  test("client-side navigation from home to posts", async ({ page }) => {
    await page.goto("/");
    await page.click("a[href='/posts']");
    await expect(page).toHaveURL("/posts");
    await expect(page.locator("h1")).toContainText("Posts");
    // No full reload — page title updates without a flash
  });

  test("back-navigation works", async ({ page }) => {
    await page.goto("/posts");
    await page.click("a[href^='/posts/']");
    await expect(page.url()).toMatch(/\/posts\/\d+/);
    await page.goBack();
    await expect(page).toHaveURL("/posts");
  });
});

test.describe("dev server — dev toolbar", () => {
  test("toolbar is injected in dev mode", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#__alab_toolbar")).toBeVisible();
  });

  test("toolbar shows correct route file", async ({ page }) => {
    await page.goto("/");
    const bar = page.locator("#__alab_bar");
    await expect(bar).toContainText("page.tsx");
  });

  test("toolbar expands on click", async ({ page }) => {
    await page.goto("/");
    const panel = page.locator("#__alab_panel");
    await expect(panel).not.toHaveClass(/open/);
    await page.click("#__alab_bar");
    await expect(panel).toHaveClass(/open/);
  });

  test("toolbar shows SSR badge on SSR page", async ({ page }) => {
    await page.goto("/posts");
    const bar = page.locator("#__alab_bar");
    await expect(bar).toContainText("SSR");
  });
});

test.describe("dev server — API routes", () => {
  test("/_alabjs/__devtools returns route list", async ({ request }) => {
    const res = await request.get("/_alabjs/__devtools");
    expect(res.status()).toBe(200);
    const body = await res.json() as {
      routes: unknown[];
      serverFunctions: unknown[];
      buildId: string;
    };
    expect(Array.isArray(body.routes)).toBe(true);
    expect(body.routes.length).toBeGreaterThan(0);
    expect(body.buildId).toMatch(/^dev-/);
  });

  test("/sitemap.xml returns valid XML", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("xml");
    const text = await res.text();
    expect(text).toContain("<urlset");
    expect(text).toContain("<loc>");
  });
});

test.describe("dev server — security headers", () => {
  test("security headers are set on every response", async ({ request }) => {
    const res = await request.get("/");
    const headers = res.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});
