import { describe, it, expect } from "vitest";
import { generateSitemap } from "./sitemap.js";
import type { Route } from "../router/manifest.js";

describe("generateSitemap", () => {
  it("generates valid XML envelope", () => {
    const xml = generateSitemap([], "https://example.com");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<urlset");
    expect(xml).toContain("</urlset>");
  });

  it("includes static page routes", () => {
    const routes: Route[] = [
      { path: "/", file: "app/page.tsx", kind: "page", ssr: false, params: [] },
      { path: "/about", file: "app/about/page.tsx", kind: "page", ssr: false, params: [] },
    ];
    const xml = generateSitemap(routes, "https://example.com");
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/about</loc>");
  });

  it("excludes dynamic routes with [param]", () => {
    const routes: Route[] = [
      { path: "/", file: "app/page.tsx", kind: "page", ssr: false, params: [] },
      { path: "/users/[id]", file: "app/users/[id]/page.tsx", kind: "page", ssr: false, params: ["id"] },
    ];
    const xml = generateSitemap(routes, "https://example.com");
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).not.toContain("/users/[id]");
  });

  it("excludes API routes", () => {
    const routes: Route[] = [
      { path: "/", file: "app/page.tsx", kind: "page", ssr: false, params: [] },
      { path: "/api/health", file: "app/api/health/route.ts", kind: "api", ssr: false, params: [] },
    ];
    const xml = generateSitemap(routes, "https://example.com");
    expect(xml).not.toContain("/api/health");
  });

  it("strips trailing slash from base URL", () => {
    const routes: Route[] = [
      { path: "/about", file: "app/about/page.tsx", kind: "page", ssr: false, params: [] },
    ];
    const xml = generateSitemap(routes, "https://example.com/");
    expect(xml).toContain("<loc>https://example.com/about</loc>");
    // Should NOT have double slash
    expect(xml).not.toContain("https://example.com//about");
  });

  it("escapes XML special characters", () => {
    const routes: Route[] = [
      { path: "/search&filter", file: "app/search/page.tsx", kind: "page", ssr: false, params: [] },
    ];
    const xml = generateSitemap(routes, "https://example.com");
    expect(xml).toContain("&amp;");
    expect(xml).not.toContain("&filter");
  });

  it("includes changefreq for each URL", () => {
    const routes: Route[] = [
      { path: "/", file: "app/page.tsx", kind: "page", ssr: false, params: [] },
    ];
    const xml = generateSitemap(routes, "https://example.com");
    expect(xml).toContain("<changefreq>weekly</changefreq>");
  });
});
