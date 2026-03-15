import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCached,
  setCache,
  invalidateCache,
  invalidateCacheKey,
  CACHE_MISS,
  getCachedPage,
  setCachedPage,
  markPageRevalidating,
  isPageRevalidating,
  revalidatePath,
  revalidatePathPrefix,
  revalidateTag,
  inspectCache,
} from "./cache.js";

// ─── Server-function cache ────────────────────────────────────────────────────

describe("server-function cache", () => {
  beforeEach(() => {
    // Clear cache between tests by invalidating everything
    invalidateCacheKey("test-key");
    invalidateCacheKey("a");
    invalidateCacheKey("b");
    invalidateCacheKey("c");
    invalidateCacheKey("tagged");
    invalidateCacheKey("other");
    invalidateCacheKey("expired");
  });

  it("returns CACHE_MISS for unknown keys", () => {
    expect(getCached("nonexistent")).toBe(CACHE_MISS);
  });

  it("stores and retrieves values", () => {
    setCache("test-key", { name: "Ada" }, { ttl: 60 });
    expect(getCached("test-key")).toEqual({ name: "Ada" });
  });

  it("stores primitive values", () => {
    setCache("a", 42, { ttl: 60 });
    setCache("b", "hello", { ttl: 60 });
    setCache("c", null, { ttl: 60 });
    expect(getCached("a")).toBe(42);
    expect(getCached("b")).toBe("hello");
    expect(getCached("c")).toBe(null);
  });

  it("returns CACHE_MISS for expired entries", () => {
    // Set with 0 second TTL (expired immediately)
    setCache("expired", "old", { ttl: 0 });
    // Advance time slightly
    vi.useFakeTimers();
    vi.advanceTimersByTime(1);
    expect(getCached("expired")).toBe(CACHE_MISS);
    vi.useRealTimers();
  });

  it("invalidates by tag", () => {
    setCache("tagged", { id: 1 }, { ttl: 60, tags: ["posts", "post:1"] });
    setCache("other", { id: 2 }, { ttl: 60, tags: ["users"] });

    invalidateCache({ tags: ["posts"] });

    expect(getCached("tagged")).toBe(CACHE_MISS);
    expect(getCached("other")).not.toBe(CACHE_MISS);
  });

  it("invalidates by exact key", () => {
    setCache("a", 1, { ttl: 60 });
    invalidateCacheKey("a");
    expect(getCached("a")).toBe(CACHE_MISS);
  });

  it("revalidateTag is an alias for invalidateCache", () => {
    setCache("tagged", "data", { ttl: 60, tags: ["t1"] });
    revalidateTag({ tags: ["t1"] });
    expect(getCached("tagged")).toBe(CACHE_MISS);
  });

  it("inspectCache returns live entries", () => {
    setCache("a", 1, { ttl: 60, tags: ["x"] });
    setCache("b", 2, { ttl: 120 });
    const snapshot = inspectCache();
    expect(snapshot.length).toBeGreaterThanOrEqual(2);
    const aEntry = snapshot.find((e) => e.key === "a");
    expect(aEntry).toBeDefined();
    expect(aEntry!.tags).toContain("x");
    expect(aEntry!.expiresIn).toBeGreaterThan(0);
  });

  it("inspectCache filters out expired entries", () => {
    setCache("expired", "data", { ttl: 0 });
    vi.useFakeTimers();
    vi.advanceTimersByTime(1);
    const snapshot = inspectCache();
    expect(snapshot.find((e) => e.key === "expired")).toBeUndefined();
    vi.useRealTimers();
  });
});

// ─── Page cache (ISR) ─────────────────────────────────────────────────────────

describe("page cache (ISR)", () => {
  beforeEach(() => {
    revalidatePath("/test");
    revalidatePath("/a");
    revalidatePath("/a/1");
    revalidatePath("/a/2");
    revalidatePath("/b");
  });

  it("returns null for uncached pages", () => {
    expect(getCachedPage("/test")).toBe(null);
  });

  it("stores and retrieves page HTML", () => {
    setCachedPage("/test", "<html>test</html>", 60);
    const result = getCachedPage("/test");
    expect(result).not.toBe(null);
    expect(result!.html).toBe("<html>test</html>");
    expect(result!.stale).toBe(false);
  });

  it("returns stale entry after TTL expires (stale-while-revalidate)", () => {
    vi.useFakeTimers();
    setCachedPage("/test", "<html>stale</html>", 10);
    // Advance past the TTL
    vi.advanceTimersByTime(11_000);
    const result = getCachedPage("/test");
    expect(result).not.toBe(null);
    expect(result!.stale).toBe(true);
    vi.useRealTimers();
  });

  it("markPageRevalidating and isPageRevalidating", () => {
    setCachedPage("/test", "<html>test</html>", 60);
    expect(isPageRevalidating("/test")).toBe(false);
    markPageRevalidating("/test");
    expect(isPageRevalidating("/test")).toBe(true);
  });

  it("isPageRevalidating returns false for uncached pages", () => {
    expect(isPageRevalidating("/nonexistent")).toBe(false);
  });

  it("revalidatePath removes the cached page", () => {
    setCachedPage("/test", "<html>test</html>", 60);
    revalidatePath("/test");
    expect(getCachedPage("/test")).toBe(null);
  });

  it("revalidatePathPrefix removes matching pages", () => {
    setCachedPage("/a", "<html>a</html>", 60);
    setCachedPage("/a/1", "<html>a1</html>", 60);
    setCachedPage("/a/2", "<html>a2</html>", 60);
    setCachedPage("/b", "<html>b</html>", 60);

    revalidatePathPrefix("/a");

    expect(getCachedPage("/a")).toBe(null);
    expect(getCachedPage("/a/1")).toBe(null);
    expect(getCachedPage("/a/2")).toBe(null);
    expect(getCachedPage("/b")).not.toBe(null);
  });
});
