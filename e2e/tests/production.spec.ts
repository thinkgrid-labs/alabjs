/**
 * Production server E2E tests — `alab start`
 *
 * Requires `alab build` to have run first (enforced via `dependencies: ["build"]`
 * in playwright.config.ts).
 */

import { test, expect } from "@playwright/test";

test.describe("production — pages", () => {
  test("home page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/AlabJS|Alab/i);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("posts page renders SSR content", async ({ page }) => {
    await page.goto("/posts");
    await expect(page.locator("h1")).toContainText("Posts");
    await expect(page.locator("a[href^='/posts/']").first()).toBeVisible();
  });

  test("individual post page renders", async ({ page }) => {
    await page.goto("/posts/1");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("404 returns correct status", async ({ page }) => {
    const res = await page.goto("/no-such-page");
    expect(res?.status()).toBe(404);
  });
});

test.describe("production — skew protection", () => {
  test("every page response includes X-Alab-Build-ID header", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["x-alab-build-id"]).toBeTruthy();
  });

  test("build ID is consistent across requests", async ({ request }) => {
    const r1 = await request.get("/");
    const r2 = await request.get("/posts");
    expect(r1.headers()["x-alab-build-id"]).toBe(r2.headers()["x-alab-build-id"]);
  });

  test("HTML contains alabjs-build-id meta tag", async ({ page }) => {
    await page.goto("/");
    const meta = page.locator('meta[name="alabjs-build-id"]');
    await expect(meta).toHaveAttribute("content", /.+/);
  });
});

test.describe("production — CDN cache headers", () => {
  test("home page has public Cache-Control (cdnCache export)", async ({ request }) => {
    const res = await request.get("/");
    const cc = res.headers()["cache-control"] ?? "";
    expect(cc).toContain("s-maxage=");
    expect(cc).toContain("public");
  });

  test("posts page has public Cache-Control (cdnCache + ppr)", async ({ request }) => {
    const res = await request.get("/posts");
    const cc = res.headers()["cache-control"] ?? "";
    expect(cc).toContain("public");
  });
});

test.describe("production — PPR", () => {
  test("posts page is served as PPR shell", async ({ request }) => {
    const res = await request.get("/posts");
    expect(res.headers()["x-alab-ppr"]).toBe("shell");
  });

  test("PPR shell contains data-ppr-hole placeholder", async ({ page }) => {
    await page.goto("/posts");
    // The shell has a ppr-hole div; Dynamic fills it in after hydration
    const hole = page.locator('[data-ppr-hole="posts-list"]');
    await expect(hole).toBeAttached();
  });
});

test.describe("production — analytics", () => {
  test("POST /_alabjs/vitals returns 204", async ({ request }) => {
    const res = await request.post("/_alabjs/vitals", {
      headers: { "content-type": "application/json" },
      data: { name: "LCP", value: 1200, route: "/" },
    });
    expect(res.status()).toBe(204);
  });

  test("GET /_alabjs/analytics returns 401 without secret", async ({ request }) => {
    const res = await request.get("/_alabjs/analytics");
    // Analytics endpoint is always protected — 401 unless ALAB_ANALYTICS_SECRET is set
    expect(res.status()).toBe(401);
  });

  test("analytics records vitals and returns snapshot when secret is set", async ({ request }) => {
    const secret = process.env["ALAB_ANALYTICS_SECRET"];
    if (!secret) {
      // Skip if no secret configured — endpoint is intentionally closed
      return;
    }

    // Send a beacon
    await request.post("/_alabjs/vitals", {
      headers: { "content-type": "application/json" },
      data: { name: "FCP", value: 800, route: "/e2e-test" },
    });

    // Read back with valid secret
    const snap = await request.get("/_alabjs/analytics", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(snap.status()).toBe(200);
    const body = await snap.json() as { routes: Record<string, { fcp_p75: number | null }> };
    expect(body.routes["/e2e-test"]?.fcp_p75).toBe(800);
  });
});

test.describe("production — sitemap", () => {
  test("/sitemap.xml is served", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain("<urlset");
    expect(xml).toContain("/posts");
  });

  test("sitemap has correct cache headers", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.headers()["cache-control"]).toContain("max-age=3600");
  });
});

test.describe("production — security headers", () => {
  test("security headers present on all responses", async ({ request }) => {
    for (const path of ["/", "/posts", "/sitemap.xml"]) {
      const res = await request.get(path);
      const h = res.headers();
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["x-frame-options"], path).toBe("SAMEORIGIN");
    }
  });

  test("no dev toolbar in production HTML", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#__alab_toolbar")).not.toBeAttached();
  });
});

test.describe("production — static assets", () => {
  test("client JS assets are served with immutable cache", async ({ request }) => {
    // Get page HTML, find a hashed JS asset URL
    const page = await request.get("/");
    const html = await page.text();
    const match = /src="(\/_alabjs\/[^"]+\.[a-f0-9]{8,}\.(js|mjs))"/.exec(html);
    if (match?.[1]) {
      const asset = await request.get(match[1]);
      expect(asset.status()).toBe(200);
      const cc = asset.headers()["cache-control"] ?? "";
      expect(cc).toContain("immutable");
      expect(cc).toContain("max-age=31536000");
    }
  });
});
