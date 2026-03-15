import { describe, it, expect, beforeEach } from "vitest";
import { defineServerFn } from "./index.js";
import { invalidateCacheKey, getCached, CACHE_MISS } from "./cache.js";

describe("defineServerFn", () => {
  // ── Basic invocation ──────────────────────────────────────────────────────

  it("returns a callable function", () => {
    const fn = defineServerFn(async () => "hello");
    expect(typeof fn).toBe("function");
  });

  it("invokes the handler with context and input", async () => {
    const fn = defineServerFn(async (ctx, input: { name: string }) => {
      return { greeting: `Hello, ${input.name}` };
    });

    const ctx = {
      params: {},
      query: {},
      headers: {},
      method: "POST" as const,
      url: "/test",
    };

    const result = await fn(ctx, { name: "Ada" });
    expect(result).toEqual({ greeting: "Hello, Ada" });
  });

  // ── Zod validation (duck-typed) ───────────────────────────────────────────

  it("validates input with a Zod-like schema", async () => {
    const mockSchema = {
      safeParse(input: unknown) {
        const obj = input as Record<string, unknown>;
        if (typeof obj?.["name"] === "string" && (obj["name"] as string).length > 0) {
          return { success: true as const, data: obj };
        }
        return { success: false as const, error: { issues: [{ message: "name required" }] } };
      },
    };

    const fn = defineServerFn(mockSchema, async (_ctx, input) => {
      return { validated: (input as { name: string }).name };
    });

    const ctx = {
      params: {},
      query: {},
      headers: {},
      method: "POST" as const,
      url: "/test",
    };

    const result = await fn(ctx, { name: "Ada" });
    expect(result).toEqual({ validated: "Ada" });
  });

  it("throws zodError on validation failure", async () => {
    const mockSchema = {
      safeParse(_input: unknown) {
        return {
          success: false as const,
          error: { issues: [{ message: "name required" }] },
        };
      },
    };

    const fn = defineServerFn(mockSchema, async () => {
      return { ok: true };
    });

    const ctx = {
      params: {},
      query: {},
      headers: {},
      method: "POST" as const,
      url: "/test",
    };

    try {
      await fn(ctx, {});
      expect.fail("Should have thrown");
    } catch (err) {
      expect((err as Error).message).toBe("[alabjs] Validation failed");
      expect((err as Error & { zodError: unknown }).zodError).toBeDefined();
    }
  });

  // ── Caching ──────────────────────────────────────────────────────────────

  describe("with cache option", () => {
    let callCount: number;

    beforeEach(() => {
      callCount = 0;
      // Clear any cache from previous test
      invalidateCacheKey(":undefined");
    });

    it("caches the result on first call and returns cached on second", async () => {
      const fn = defineServerFn(
        async (_ctx, _input) => {
          callCount++;
          return { count: callCount };
        },
        { cache: { ttl: 60, tags: ["test"] } },
      );

      const ctx = {
        params: {},
        query: {},
        headers: {},
        method: "GET" as const,
        url: "/test",
      };

      const first = await fn(ctx, undefined);
      const second = await fn(ctx, undefined);

      // Both calls should return the same result
      expect(first).toEqual(second);
      // Handler should only have been called once (second was cached)
      expect(callCount).toBe(1);
    });
  });
});
