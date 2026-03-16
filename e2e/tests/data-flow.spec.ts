/**
 * Data-flow E2E tests — SSR → hydration → mutation → stale-while-revalidate
 *
 * Validates the complete data lifecycle in production mode:
 *   1. SSR        — raw HTML response contains server-rendered data before JS runs
 *   2. Hydration  — React mounts cleanly; SPA navigation confirms the client is live
 *   3. Mutation   — server function RPC (POST /_alabjs/fn/:fn) returns data correctly
 *   4. SWR / ISR  — revalidate endpoint purges cache; next request re-renders and re-caches
 *
 * Uses the basic-ssr example app (posts + post detail pages).
 */

import { test, expect } from "@playwright/test";

// ── 1. SSR ────────────────────────────────────────────────────────────────────

test.describe("data-flow — SSR", () => {
  test("posts page HTML contains server-rendered content before JS executes", async ({ request }) => {
    const res = await request.get("/posts");
    expect(res.status()).toBe(200);
    const html = await res.text();

    // Content is present in the raw HTML response — not deferred to the client
    expect(html).toContain("Posts");
    expect(html).toContain('href="/posts/');
    // React SSR marker is present (confirms renderToPipeableStream ran)
    expect(html).toContain('data-reactroot');
  });

  test("post detail page HTML contains post content before JS executes", async ({ request }) => {
    const res = await request.get("/posts/1");
    expect(res.status()).toBe(200);
    const html = await res.text();
    // Full post body is server-rendered — not fetched client-side
    expect(html).toContain("<h1");
    expect(html).toMatch(/<article|<main|<section/);
  });

  test("SSR page includes CSRF meta tag for client use", async ({ request }) => {
    const res = await request.get("/posts");
    const html = await res.text();
    expect(html).toContain('name="csrf-token"');
  });
});

// ── 2. Hydration ──────────────────────────────────────────────────────────────

test.describe("data-flow — hydration", () => {
  test("React hydrates without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/posts");
    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter(
      (e) => e.includes("Hydration") || e.includes("hydrat") || e.includes("did not match"),
    );
    expect(hydrationErrors).toHaveLength(0);
  });

  test("SPA navigation works after hydration (client router is live)", async ({ page }) => {
    await page.goto("/posts");
    await page.waitForLoadState("networkidle");

    // Track whether a full page reload happens — SPA nav must NOT reload
    let reloaded = false;
    page.on("load", () => { reloaded = true; });
    // Reset flag after initial load settles
    reloaded = false;

    await page.click("a[href^='/posts/']");
    await page.waitForURL(/\/posts\/\d+/);

    expect(reloaded).toBe(false); // no full reload = SPA nav handled by React
    await expect(page.locator("h1")).toBeVisible();
  });

  test("back navigation returns to posts list (history API is wired)", async ({ page }) => {
    await page.goto("/posts");
    await page.waitForLoadState("networkidle");
    await page.click("a[href^='/posts/']");
    await page.waitForURL(/\/posts\/\d+/);
    await page.goBack();
    await expect(page).toHaveURL("/posts");
    await expect(page.locator("h1")).toContainText("Posts");
  });
});

// ── 3. Mutation (server function RPC) ─────────────────────────────────────────

test.describe("data-flow — mutation", () => {
  test("getPosts server function returns a non-empty array", async ({ page }) => {
    await page.goto("/");
    // Read the CSRF token the server injected into the page (cookie is not HttpOnly)
    const csrfToken = await page.evaluate(
      () => document.cookie.match(/alab-csrf=([^;]+)/)?.[1] ?? "",
    );

    // page.request shares the browser's cookie jar — CSRF cookie is included automatically
    const res = await page.request.post("/_alabjs/fn/getPosts", {
      headers: {
        "content-type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      data: {},
    });

    expect(res.status()).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test("getPost server function returns the correct post", async ({ page }) => {
    await page.goto("/");
    const csrfToken = await page.evaluate(
      () => document.cookie.match(/alab-csrf=([^;]+)/)?.[1] ?? "",
    );

    const res = await page.request.post("/_alabjs/fn/getPost", {
      headers: {
        "content-type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      data: { id: "1" },
    });

    expect(res.status()).toBe(200);
    const post = await res.json() as { id: string; title: string };
    expect(post.id).toBe("1");
    expect(typeof post.title).toBe("string");
  });

  test("unknown server function returns 404", async ({ request }) => {
    const res = await request.post("/_alabjs/fn/__nonexistent", {
      headers: { "content-type": "application/json" },
      data: {},
    });
    expect(res.status()).toBe(404);
  });
});

// ── 4. Stale-while-revalidate / ISR ───────────────────────────────────────────

test.describe("data-flow — stale-while-revalidate", () => {
  test("posts page is served with public Cache-Control (ISR active)", async ({ request }) => {
    const res = await request.get("/posts");
    const cc = res.headers()["cache-control"] ?? "";
    expect(cc).toContain("public");
    expect(cc).toMatch(/s-maxage|max-age/);
  });

  test("revalidate endpoint purges page and returns { revalidated: true }", async ({ request }) => {
    // Warm the cache
    await request.get("/posts");

    const purge = await request.post("/_alabjs/revalidate", {
      headers: { "content-type": "application/json" },
      data: { path: "/posts" },
    });

    expect(purge.status()).toBe(200);
    const body = await purge.json() as { revalidated: boolean; path: string };
    expect(body.revalidated).toBe(true);
    expect(body.path).toBe("/posts");
  });

  test("page re-renders correctly after cache is purged", async ({ request }) => {
    await request.post("/_alabjs/revalidate", {
      headers: { "content-type": "application/json" },
      data: { path: "/posts" },
    });

    // After purge the server must generate a fresh response (not serve nothing)
    const res = await request.get("/posts");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("Posts");
    expect(html).toContain('href="/posts/');
  });

  test("revalidateTag purges all pages carrying the matching tag", async ({ request }) => {
    const purge = await request.post("/_alabjs/revalidate", {
      headers: { "content-type": "application/json" },
      data: { tags: ["posts"] },
    });

    expect(purge.status()).toBe(200);
    const body = await purge.json() as { revalidated: boolean; tags: string[] };
    expect(body.revalidated).toBe(true);
    expect(body.tags).toContain("posts");

    // All pages tagged "posts" are still served correctly after purge
    const res = await request.get("/posts");
    expect(res.status()).toBe(200);
  });
});

// ── 5. Security headers (includes CSP added in bug-fix pass) ──────────────────

test.describe("data-flow — security headers", () => {
  test("Content-Security-Policy header is present on page responses", async ({ request }) => {
    const res = await request.get("/posts");
    const csp = res.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("default-src");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  test("CSP is present on API route responses", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.headers()["content-security-policy"]).toBeTruthy();
  });
});
