import { describe, it, expect } from "vitest";
import {
  matcherToRegex,
  matchesMiddleware,
  runMiddleware,
  redirect,
  next,
  type MiddlewareModule,
} from "./middleware.js";

// ─── matcherToRegex ───────────────────────────────────────────────────────────

describe("matcherToRegex", () => {
  it("matches exact static path", () => {
    const re = matcherToRegex("/dashboard");
    expect(re.test("/dashboard")).toBe(true);
    expect(re.test("/dashboard/")).toBe(true);
    expect(re.test("/other")).toBe(false);
  });

  it("handles :param as single segment", () => {
    const re = matcherToRegex("/users/:id");
    expect(re.test("/users/123")).toBe(true);
    expect(re.test("/users/abc")).toBe(true);
    expect(re.test("/users/")).toBe(false);
    expect(re.test("/users/123/extra")).toBe(false);
  });

  it("handles * as single segment wildcard", () => {
    const re = matcherToRegex("/api/*");
    expect(re.test("/api/health")).toBe(true);
    expect(re.test("/api/users")).toBe(true);
    expect(re.test("/api/")).toBe(false);
    expect(re.test("/api/a/b")).toBe(false);
  });

  it("handles ** as zero-or-more segments", () => {
    const re = matcherToRegex("/docs/**");
    expect(re.test("/docs/")).toBe(true);
    expect(re.test("/docs/intro")).toBe(true);
    expect(re.test("/docs/guides/auth")).toBe(true);
  });

  it("handles :param* (Next.js :path* style)", () => {
    const re = matcherToRegex("/dashboard/:path*");
    expect(re.test("/dashboard")).toBe(true);
    expect(re.test("/dashboard/")).toBe(true);
    expect(re.test("/dashboard/settings")).toBe(true);
    expect(re.test("/dashboard/users/42")).toBe(true);
  });

  it("escapes special regex characters in static segments", () => {
    const re = matcherToRegex("/search.html");
    expect(re.test("/search.html")).toBe(true);
    expect(re.test("/searchXhtml")).toBe(false);
  });
});

// ─── matchesMiddleware ────────────────────────────────────────────────────────

describe("matchesMiddleware", () => {
  it("matches all paths when no matchers provided", () => {
    expect(matchesMiddleware("/anything")).toBe(true);
    expect(matchesMiddleware("/anything", undefined)).toBe(true);
    expect(matchesMiddleware("/anything", [])).toBe(true);
  });

  it("matches when pathname fits a pattern", () => {
    const matchers = ["/dashboard/:path*", "/api/*"];
    expect(matchesMiddleware("/dashboard/settings", matchers)).toBe(true);
    expect(matchesMiddleware("/api/health", matchers)).toBe(true);
    expect(matchesMiddleware("/login", matchers)).toBe(false);
  });
});

// ─── redirect and next helpers ────────────────────────────────────────────────

describe("redirect", () => {
  it("returns a Response with redirect status", () => {
    const res = redirect("https://example.com/login");
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(307);
  });

  it("supports custom status codes", () => {
    const res = redirect("https://example.com/login", 301);
    expect(res.status).toBe(301);
  });
});

describe("next", () => {
  it("returns null", () => {
    expect(next()).toBe(null);
  });
});

// ─── runMiddleware ────────────────────────────────────────────────────────────

describe("runMiddleware", () => {
  it("returns null if pathname does not match the matcher", async () => {
    const mod: MiddlewareModule = {
      middleware: () => redirect("https://example.com/login"),
      config: { matcher: ["/dashboard/:path*"] },
    };
    const req = new Request("http://localhost/login");
    const result = await runMiddleware(mod, req);
    expect(result).toBe(null);
  });

  it("returns Response when middleware redirects", async () => {
    const mod: MiddlewareModule = {
      middleware: () => redirect("https://example.com/login"),
      config: { matcher: ["/dashboard/:path*"] },
    };
    const req = new Request("http://localhost/dashboard/settings");
    const result = await runMiddleware(mod, req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(307);
  });

  it("returns null when middleware passes through", async () => {
    const mod: MiddlewareModule = {
      middleware: () => undefined,
    };
    const req = new Request("http://localhost/anything");
    const result = await runMiddleware(mod, req);
    expect(result).toBe(null);
  });

  it("returns null when middleware returns null (via next())", async () => {
    const mod: MiddlewareModule = {
      middleware: () => next(),
    };
    const req = new Request("http://localhost/anything");
    const result = await runMiddleware(mod, req);
    expect(result).toBe(null);
  });

  it("runs on all paths when no config.matcher is set", async () => {
    let called = false;
    const mod: MiddlewareModule = {
      middleware: () => {
        called = true;
        return null;
      },
    };
    const req = new Request("http://localhost/random/path");
    await runMiddleware(mod, req);
    expect(called).toBe(true);
  });
});
