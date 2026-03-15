import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  scanDevRoutes,
  matchDevRoute,
  findLayoutFiles,
  findErrorFile,
  findLoadingFile,
  scanDevApiRoutes,
  matchDevApiRoute,
} from "./router-dev.js";

let appDir: string;

beforeEach(() => {
  appDir = mkdtempSync(join(tmpdir(), "alab-test-"));
});

afterEach(() => {
  rmSync(appDir, { recursive: true, force: true });
});

function createFile(relPath: string, content = "export default function Page() { return null; }") {
  const full = join(appDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf8");
}

// ─── scanDevRoutes ────────────────────────────────────────────────────────────

describe("scanDevRoutes", () => {
  it("finds page.tsx at root", () => {
    createFile("page.tsx");
    const routes = scanDevRoutes(appDir);
    expect(routes).toHaveLength(1);
    expect(routes[0]!.pattern.test("/")).toBe(true);
  });

  it("finds nested page.tsx", () => {
    createFile("about/page.tsx");
    const routes = scanDevRoutes(appDir);
    expect(routes).toHaveLength(1);
    expect(routes[0]!.pattern.test("/about")).toBe(true);
  });

  it("finds dynamic route [id]", () => {
    createFile("users/[id]/page.tsx");
    const routes = scanDevRoutes(appDir);
    expect(routes).toHaveLength(1);
    expect(routes[0]!.pattern.test("/users/42")).toBe(true);
    expect(routes[0]!.paramNames).toEqual(["id"]);
  });

  it("sorts static routes before dynamic ones", () => {
    createFile("users/new/page.tsx");
    createFile("users/[id]/page.tsx");
    const routes = scanDevRoutes(appDir);
    expect(routes).toHaveLength(2);
    // Static route (0 params) should come first
    expect(routes[0]!.paramNames).toHaveLength(0);
    expect(routes[1]!.paramNames).toHaveLength(1);
  });

  it("finds page.ts files too", () => {
    createFile("page.ts");
    const routes = scanDevRoutes(appDir);
    expect(routes).toHaveLength(1);
  });

  it("returns empty for empty directory", () => {
    const routes = scanDevRoutes(appDir);
    expect(routes).toHaveLength(0);
  });
});

// ─── matchDevRoute ────────────────────────────────────────────────────────────

describe("matchDevRoute", () => {
  it("matches a static route", () => {
    createFile("about/page.tsx");
    const routes = scanDevRoutes(appDir);
    const match = matchDevRoute(routes, "/about");
    expect(match).not.toBe(null);
    expect(match!.params).toEqual({});
  });

  it("matches root route", () => {
    createFile("page.tsx");
    const routes = scanDevRoutes(appDir);
    const match = matchDevRoute(routes, "/");
    expect(match).not.toBe(null);
  });

  it("extracts dynamic params", () => {
    createFile("users/[id]/page.tsx");
    const routes = scanDevRoutes(appDir);
    const match = matchDevRoute(routes, "/users/42");
    expect(match).not.toBe(null);
    expect(match!.params).toEqual({ id: "42" });
  });

  it("returns null for unmatched path", () => {
    createFile("about/page.tsx");
    const routes = scanDevRoutes(appDir);
    const match = matchDevRoute(routes, "/nonexistent");
    expect(match).toBe(null);
  });

  it("decodes URI components in params", () => {
    createFile("posts/[slug]/page.tsx");
    const routes = scanDevRoutes(appDir);
    const match = matchDevRoute(routes, "/posts/hello%20world");
    expect(match).not.toBe(null);
    expect(match!.params["slug"]).toBe("hello world");
  });

  it("matches with optional trailing slash", () => {
    createFile("about/page.tsx");
    const routes = scanDevRoutes(appDir);
    const match = matchDevRoute(routes, "/about/");
    expect(match).not.toBe(null);
  });
});

// ─── findLayoutFiles ──────────────────────────────────────────────────────────

describe("findLayoutFiles", () => {
  it("finds root layout", () => {
    createFile("layout.tsx");
    createFile("page.tsx");
    const layouts = findLayoutFiles(join(appDir, "page.tsx"), appDir);
    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toContain("layout.tsx");
  });

  it("finds nested layouts ordered outermost first", () => {
    createFile("layout.tsx");
    createFile("dashboard/layout.tsx");
    createFile("dashboard/settings/page.tsx");
    const layouts = findLayoutFiles(join(appDir, "dashboard/settings/page.tsx"), appDir);
    expect(layouts).toHaveLength(2);
    // Root layout should come first
    expect(layouts[0]).toContain(join(appDir, "layout.tsx"));
    expect(layouts[1]).toContain(join(appDir, "dashboard/layout.tsx"));
  });

  it("returns empty when no layouts exist", () => {
    createFile("about/page.tsx");
    const layouts = findLayoutFiles(join(appDir, "about/page.tsx"), appDir);
    expect(layouts).toHaveLength(0);
  });
});

// ─── findErrorFile ────────────────────────────────────────────────────────────

describe("findErrorFile", () => {
  it("finds nearest error.tsx", () => {
    createFile("error.tsx");
    createFile("dashboard/page.tsx");
    const errorFile = findErrorFile(join(appDir, "dashboard/page.tsx"), appDir);
    expect(errorFile).not.toBe(null);
    expect(errorFile).toContain("error.tsx");
  });

  it("returns null when no error file exists", () => {
    createFile("page.tsx");
    const errorFile = findErrorFile(join(appDir, "page.tsx"), appDir);
    expect(errorFile).toBe(null);
  });

  it("prefers the innermost error.tsx", () => {
    createFile("error.tsx");
    createFile("dashboard/error.tsx");
    createFile("dashboard/settings/page.tsx");
    const errorFile = findErrorFile(join(appDir, "dashboard/settings/page.tsx"), appDir);
    expect(errorFile).toContain(join("dashboard", "error.tsx"));
  });
});

// ─── findLoadingFile ──────────────────────────────────────────────────────────

describe("findLoadingFile", () => {
  it("finds nearest loading.tsx", () => {
    createFile("loading.tsx");
    createFile("page.tsx");
    const loadingFile = findLoadingFile(join(appDir, "page.tsx"), appDir);
    expect(loadingFile).not.toBe(null);
    expect(loadingFile).toContain("loading.tsx");
  });

  it("returns null when no loading file exists", () => {
    createFile("page.tsx");
    const loadingFile = findLoadingFile(join(appDir, "page.tsx"), appDir);
    expect(loadingFile).toBe(null);
  });
});

// ─── API routes ───────────────────────────────────────────────────────────────

describe("scanDevApiRoutes", () => {
  it("finds route.ts files", () => {
    createFile("api/health/route.ts");
    const routes = scanDevApiRoutes(appDir);
    expect(routes).toHaveLength(1);
  });

  it("returns empty when no route files", () => {
    createFile("page.tsx");
    const routes = scanDevApiRoutes(appDir);
    expect(routes).toHaveLength(0);
  });
});

describe("matchDevApiRoute", () => {
  it("matches static API route", () => {
    createFile("api/health/route.ts");
    const routes = scanDevApiRoutes(appDir);
    const match = matchDevApiRoute(routes, "/api/health");
    expect(match).not.toBe(null);
  });

  it("returns null for unmatched API path", () => {
    createFile("api/health/route.ts");
    const routes = scanDevApiRoutes(appDir);
    const match = matchDevApiRoute(routes, "/api/nonexistent");
    expect(match).toBe(null);
  });
});
