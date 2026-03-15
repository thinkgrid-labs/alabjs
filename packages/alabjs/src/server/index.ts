import type { ServerFn, ServerFnContext } from "../types/index.js";
import { getCached, setCache, CACHE_MISS } from "./cache.js";

// ─── Cache options ─────────────────────────────────────────────────────────────

export interface ServerFnCacheOptions<Input> {
  /** How long to keep the result in seconds. Required when `cache` is set. */
  ttl: number;
  /**
   * Tags for group invalidation via `invalidateCache({ tags })`.
   * Can be a static array or a function that receives the input and returns tags,
   * allowing per-argument granularity like `post:${input.id}`.
   */
  tags?: string[] | ((input: Input) => string[]);
}

export interface DefineServerFnOptions<Input> {
  /** Opt-in result caching. Nothing is cached unless this is specified. */
  cache?: ServerFnCacheOptions<Input>;
}

// ─── Zod schema detection (duck-typed, no hard Zod dependency) ────────────────

interface ZodLike<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown };
}

function isZodSchema(v: unknown): v is ZodLike<unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    "safeParse" in v &&
    typeof (v as Record<string, unknown>)["safeParse"] === "function"
  );
}

// ─── defineServerFn overloads ─────────────────────────────────────────────────

/**
 * Define a server-only function (no input schema).
 *
 * @example
 * ```ts
 * export const getPosts = defineServerFn(async () => db.posts.findAll());
 * ```
 */
export function defineServerFn<Input = undefined, Output = unknown>(
  handler: (ctx: ServerFnContext, input: Input) => Promise<Output>,
  options?: DefineServerFnOptions<Input>,
): ServerFn<Input, Output>;

/**
 * Define a server-only function with **Zod input validation**.
 *
 * If validation fails, an HTTP 422 response with the Zod error is returned
 * automatically — the handler is never called with invalid data.
 *
 * The client's `useMutation` / `useServerData` will receive
 * `{ zodError: ZodError }` instead of throwing an untyped error.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 *
 * export const createPost = defineServerFn(
 *   z.object({ title: z.string().min(1), body: z.string() }),
 *   async ({ params }, input) => db.posts.create(input),
 *   { cache: { ttl: 0, tags: ["posts"] } },
 * );
 * ```
 */
export function defineServerFn<Schema extends ZodLike<unknown>, Output = unknown>(
  schema: Schema,
  handler: (
    ctx: ServerFnContext,
    input: Schema extends ZodLike<infer T> ? T : never,
  ) => Promise<Output>,
  options?: DefineServerFnOptions<Schema extends ZodLike<infer T> ? T : never>,
): ServerFn<Schema extends ZodLike<infer T> ? T : never, Output>;

// ─── Implementation ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineServerFn(...args: any[]): ServerFn<any, any> {
  const [schemaOrHandler, handlerOrOptions, maybeOptions] = args as [
    ZodLike<unknown> | ((...a: unknown[]) => Promise<unknown>),
    ((...a: unknown[]) => Promise<unknown>) | DefineServerFnOptions<unknown> | undefined,
    DefineServerFnOptions<unknown> | undefined,
  ];
  let schema: ZodLike<unknown> | null = null;
  let handler: (...args: unknown[]) => Promise<unknown>;
  let options: DefineServerFnOptions<unknown> | undefined;

  if (isZodSchema(schemaOrHandler)) {
    schema = schemaOrHandler;
    handler = handlerOrOptions as (...args: unknown[]) => Promise<unknown>;
    options = maybeOptions;
  } else {
    handler = schemaOrHandler as (...args: unknown[]) => Promise<unknown>;
    options = handlerOrOptions as DefineServerFnOptions<unknown> | undefined;
  }

  const cacheOpts = options?.cache;

  const wrapped = async (ctx: ServerFnContext, input: unknown): Promise<unknown> => {
    // ── Zod validation ───────────────────────────────────────────────────────
    let validatedInput = input;
    if (schema) {
      const result = schema.safeParse(input);
      if (!result.success) {
        // Throw a structured validation error that the dev/prod server will
        // serialise as { zodError: ... } with HTTP 422.
        const err = new Error("[alabjs] Validation failed") as Error & { zodError: unknown };
        err.zodError = result.error;
        throw err;
      }
      validatedInput = result.data;
    }

    // ── Cache lookup ─────────────────────────────────────────────────────────
    if (cacheOpts) {
      const cacheKey = `${handler.name}:${JSON.stringify(validatedInput)}`;
      const cached = getCached(cacheKey);
      if (cached !== CACHE_MISS) return cached;

      const data = await handler(ctx, validatedInput);

      const tags =
        typeof cacheOpts.tags === "function"
          ? cacheOpts.tags(validatedInput)
          : (cacheOpts.tags ?? []);
      setCache(cacheKey, data, { ttl: cacheOpts.ttl, tags });
      return data;
    }

    return handler(ctx, validatedInput);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return wrapped as ServerFn<any, any>;
}

export { defineSSEHandler } from "./sse.js";
export type { SSEEvent } from "./sse.js";
