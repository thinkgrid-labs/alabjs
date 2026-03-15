import type { ReactElement } from "react";

// ─── Route params ─────────────────────────────────────────────────────────────

/**
 * Extracts dynamic segment names from a route path string.
 *
 * @example
 * ExtractParams<"/users/[id]/posts/[slug]"> → "id" | "slug"
 */
type ExtractParams<Path extends string> =
  Path extends `${string}[${infer Param}]${infer Rest}`
    ? Param | ExtractParams<Rest>
    : never;

/**
 * A typed record of URL path parameters for a given route path.
 *
 * @example
 * RouteParams<"/users/[id]"> → { id: string }
 */
export type RouteParams<Path extends string = string> =
  [ExtractParams<Path>] extends [never]
    ? Record<string, string>
    : { readonly [K in ExtractParams<Path>]: string };

// ─── Server function context ───────────────────────────────────────────────────

/**
 * The context object passed to every server function.
 * All fields are readonly — the context is immutable inside a handler.
 */
export interface ServerFnContext<Path extends string = string> {
  /** Typed URL path parameters derived from the route pattern. */
  readonly params: RouteParams<Path>;
  /** Parsed query string parameters. */
  readonly query: Readonly<Record<string, string | readonly string[]>>;
  /** Raw request headers (lowercase keys). */
  readonly headers: Readonly<Record<string, string | readonly string[]>>;
  /** HTTP method — always uppercase. */
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  /** Full request URL including protocol and host. */
  readonly url: string;
}

// ─── Server function types ─────────────────────────────────────────────────────

declare const SERVER_FN_BRAND: unique symbol;

/**
 * The type of a server function defined with `defineServerFn()`.
 *
 * **Type-level boundary enforcement:**
 * - Runtime import (`import { fn } from "./page.server"`) in a client file
 *   → Rust compiler BUILD ERROR
 * - Type-only import (`import type { fn } from "./page.server"`) in a client file
 *   → ✅ Allowed — erased at compile time, used only for inference
 *
 * Use `InferServerOutput<T>` and `InferServerInput<T>` to extract the types
 * from a server function for use in `useServerData`.
 */
export type ServerFn<
  Input = undefined,
  Output = unknown,
  Path extends string = string,
> = {
  /** @internal Nominal brand — prevents plain functions from being used as ServerFn */
  readonly [SERVER_FN_BRAND]: true;
  (ctx: ServerFnContext<Path>, input: Input): Promise<Output>;
};

/** Extract the resolved output type of a ServerFn. */
export type InferServerOutput<T extends ServerFn<any, any, any>> =
  T extends ServerFn<any, infer O, any> ? Awaited<O> : never;

/** Extract the input type of a ServerFn. */
export type InferServerInput<T extends ServerFn<any, any, any>> =
  T extends ServerFn<infer I, any, any> ? I : never;

/** Extract the route path type of a ServerFn. */
export type InferServerPath<T extends ServerFn<any, any, any>> =
  T extends ServerFn<any, any, infer P> ? P : never;

// ─── Page component types ──────────────────────────────────────────────────────

/**
 * A typed React page component for a given route path.
 *
 * @example
 * // app/users/[id]/page.tsx
 * const UserPage: ALabPage<"/users/[id]"> = ({ params }) => {
 *   params.id; // string ✅
 *   params.foo; // TS error ✅
 * };
 */
export type AlabPage<Path extends string = string> = (props: {
  readonly params: RouteParams<Path>;
  readonly searchParams: Readonly<Record<string, string | readonly string[]>>;
}) => ReactElement | null;

// ─── Metadata ─────────────────────────────────────────────────────────────────

export interface OpenGraphMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
  readonly url?: string;
  readonly type?: "website" | "article" | "profile";
  readonly siteName?: string;
}

export interface TwitterMetadata {
  readonly card?: "summary" | "summary_large_image" | "app" | "player";
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
  readonly creator?: string;
}

/**
 * Export `metadata` from any page to populate `<head>` on SSR.
 *
 * @example
 * export const metadata: PageMetadata = {
 *   title: "About us",
 *   description: "Learn more about our team.",
 * };
 */
export interface PageMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly canonical?: string;
  readonly robots?: string;
  readonly og?: OpenGraphMetadata;
  readonly twitter?: TwitterMetadata;
  readonly themeColor?: string;
  /** Additional arbitrary <meta> tags. */
  readonly extra?: ReadonlyArray<Readonly<Record<string, string>>>;
}
