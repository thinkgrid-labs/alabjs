import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { applyRevalidate, checkRevalidateAuth } from "./revalidate.js";
import { setCachedPage, getCachedPage, setCache, getCached, CACHE_MISS, revalidatePath } from "./cache.js";

// ─── checkRevalidateAuth ──────────────────────────────────────────────────────

describe("checkRevalidateAuth", () => {
  const savedEnv = process.env["ALAB_REVALIDATE_SECRET"];

  afterEach(() => {
    if (savedEnv === undefined) delete process.env["ALAB_REVALIDATE_SECRET"];
    else process.env["ALAB_REVALIDATE_SECRET"] = savedEnv;
  });

  it("returns true when no secret is configured", () => {
    delete process.env["ALAB_REVALIDATE_SECRET"];
    expect(checkRevalidateAuth(undefined)).toBe(true);
    expect(checkRevalidateAuth(null)).toBe(true);
    expect(checkRevalidateAuth("Bearer anything")).toBe(true);
  });

  it("returns true when correct Bearer token is supplied", () => {
    process.env["ALAB_REVALIDATE_SECRET"] = "my-secret";
    expect(checkRevalidateAuth("Bearer my-secret")).toBe(true);
  });

  it("returns false when wrong token is supplied", () => {
    process.env["ALAB_REVALIDATE_SECRET"] = "my-secret";
    expect(checkRevalidateAuth("Bearer wrong")).toBe(false);
  });

  it("returns false when Authorization header is missing", () => {
    process.env["ALAB_REVALIDATE_SECRET"] = "my-secret";
    expect(checkRevalidateAuth(undefined)).toBe(false);
  });

  it("returns false when header is not Bearer scheme", () => {
    process.env["ALAB_REVALIDATE_SECRET"] = "my-secret";
    expect(checkRevalidateAuth("Basic my-secret")).toBe(false);
  });
});

// ─── applyRevalidate ──────────────────────────────────────────────────────────

describe("applyRevalidate", () => {
  beforeEach(() => {
    revalidatePath("/posts");
    revalidatePath("/posts/1");
    revalidatePath("/about");
  });

  it("returns 400 for non-object body", () => {
    const result = applyRevalidate("not an object");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.status).toBe(400);
  });

  it("returns 400 when no fields are provided", () => {
    const result = applyRevalidate({});
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.status).toBe(400);
  });

  it("returns 400 when tags is an empty array", () => {
    const result = applyRevalidate({ tags: [] });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.status).toBe(400);
  });

  it("purges a single path and returns it in response", () => {
    setCachedPage("/posts/1", "<html>post</html>", 60);
    const result = applyRevalidate({ path: "/posts/1" });
    expect(result).toEqual({ revalidated: true, path: "/posts/1" });
    expect(getCachedPage("/posts/1")).toBe(null);
  });

  it("purges all paths matching a prefix", () => {
    setCachedPage("/posts", "<html>posts</html>", 60);
    setCachedPage("/posts/1", "<html>post 1</html>", 60);
    setCachedPage("/about", "<html>about</html>", 60);

    const result = applyRevalidate({ prefix: "/posts" });
    expect(result).toEqual({ revalidated: true, prefix: "/posts" });
    expect(getCachedPage("/posts")).toBe(null);
    expect(getCachedPage("/posts/1")).toBe(null);
    expect(getCachedPage("/about")).not.toBe(null);
  });

  it("purges page HTML and server-fn data cache by tags", () => {
    setCachedPage("/posts", "<html>posts</html>", 60, ["posts"]);
    setCache("getPosts:", "data", { ttl: 60, tags: ["posts"] });

    const result = applyRevalidate({ tags: ["posts"] });
    expect(result).toEqual({ revalidated: true, tags: ["posts"] });
    expect(getCachedPage("/posts")).toBe(null);
    expect(getCached("getPosts:")).toBe(CACHE_MISS);
  });

  it("accepts path, prefix, and tags together", () => {
    setCachedPage("/posts/1", "<html>post</html>", 60);
    setCachedPage("/about", "<html>about</html>", 60);
    const result = applyRevalidate({ path: "/posts/1", tags: ["static"] });
    expect(result).toMatchObject({ revalidated: true, path: "/posts/1", tags: ["static"] });
    expect(getCachedPage("/posts/1")).toBe(null);
  });
});
