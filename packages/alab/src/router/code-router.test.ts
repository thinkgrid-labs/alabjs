import { describe, it, expect } from "vitest";
import { createRoute, createRouter } from "./code-router.js";

// ─── createRoute ──────────────────────────────────────────────────────────────

describe("createRoute", () => {
  it("creates a route descriptor with regex and param names", () => {
    const route = createRoute({
      path: "/users/$id",
      component: () => null,
    });
    expect(route._regex).toBeInstanceOf(RegExp);
    expect(route._paramNames).toEqual(["id"]);
  });

  it("matches static paths", () => {
    const route = createRoute({
      path: "/about",
      component: () => null,
    });
    expect(route._regex.test("/about")).toBe(true);
    expect(route._regex.test("/about/")).toBe(true);
    expect(route._regex.test("/other")).toBe(false);
  });

  it("matches dynamic segments", () => {
    const route = createRoute({
      path: "/users/$id",
      component: () => null,
    });
    expect(route._regex.test("/users/42")).toBe(true);
    expect(route._regex.test("/users/abc")).toBe(true);
    expect(route._regex.test("/users")).toBe(false);
    expect(route._regex.test("/users/42/extra")).toBe(false);
  });

  it("extracts multiple params", () => {
    const route = createRoute({
      path: "/posts/$slug/comments/$commentId",
      component: () => null,
    });
    expect(route._paramNames).toEqual(["slug", "commentId"]);
    const match = route._regex.exec("/posts/hello-world/comments/99");
    expect(match).not.toBe(null);
    expect(match![1]).toBe("hello-world");
    expect(match![2]).toBe("99");
  });

  it("matches root path", () => {
    const route = createRoute({
      path: "/",
      component: () => null,
    });
    expect(route._regex.test("/")).toBe(true);
    expect(route._regex.test("/other")).toBe(false);
    expect(route._paramNames).toEqual([]);
  });

  it("escapes special regex characters in static segments", () => {
    const route = createRoute({
      path: "/search.html",
      component: () => null,
    });
    expect(route._regex.test("/search.html")).toBe(true);
    expect(route._regex.test("/searchXhtml")).toBe(false);
  });

  it("preserves config properties", () => {
    const component = () => null;
    const loader = async () => ({ data: true });
    const route = createRoute({
      path: "/test",
      component,
      loader,
    });
    expect(route.component).toBe(component);
    expect(route.loader).toBe(loader);
    expect(route.path).toBe("/test");
  });
});

// ─── createRouter ─────────────────────────────────────────────────────────────

describe("createRouter", () => {
  it("returns a router with sorted routes", () => {
    const staticRoute = createRoute({ path: "/users/new", component: () => null });
    const dynamicRoute = createRoute({ path: "/users/$id", component: () => null });

    const router = createRouter([dynamicRoute, staticRoute]);

    // Static route (0 params) should come first
    expect(router.routes[0]!._paramNames).toHaveLength(0);
    expect(router.routes[1]!._paramNames).toHaveLength(1);
  });

  it("handles empty routes array", () => {
    const router = createRouter([]);
    expect(router.routes).toEqual([]);
  });

  it("preserves routes with equal param counts", () => {
    const a = createRoute({ path: "/users/$id", component: () => null });
    const b = createRoute({ path: "/posts/$slug", component: () => null });
    const router = createRouter([a, b]);
    expect(router.routes).toHaveLength(2);
  });
});

// ─── Route matching via regex ─────────────────────────────────────────────────

describe("route matching", () => {
  it("dynamic route captures params correctly", () => {
    const route = createRoute({
      path: "/users/$id",
      component: () => null,
    });
    const match = route._regex.exec("/users/42");
    expect(match).not.toBe(null);
    const params: Record<string, string> = {};
    route._paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(match![i + 1]!);
    });
    expect(params).toEqual({ id: "42" });
  });

  it("handles encoded URI components in params", () => {
    const route = createRoute({
      path: "/posts/$slug",
      component: () => null,
    });
    const match = route._regex.exec("/posts/hello%20world");
    expect(match).not.toBe(null);
    expect(decodeURIComponent(match![1]!)).toBe("hello world");
  });

  it("multiple dynamic routes in router — first match wins", () => {
    const staticRoute = createRoute({ path: "/users/admin", component: () => null });
    const dynamicRoute = createRoute({ path: "/users/$id", component: () => null });
    const router = createRouter([dynamicRoute, staticRoute]);

    // Static should be first in sorted order (0 params)
    const first = router.routes[0]!;
    expect(first._regex.test("/users/admin")).toBe(true);
    expect(first._paramNames).toHaveLength(0);
  });
});
