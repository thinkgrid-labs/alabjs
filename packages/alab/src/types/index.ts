/**
 * The context object passed to every server function.
 */
export interface ServerFnContext {
  /** Matched URL path parameters, e.g. `{ id: "42" }` */
  params: Record<string, string>;
  /** Parsed query string parameters */
  query: Record<string, string | string[]>;
  /** Raw request headers */
  headers: Record<string, string | string[]>;
  /** Request method (GET, POST, …) */
  method: string;
  /** Full request URL */
  url: string;
}

/**
 * The shape of a compiled server function.
 *
 * `Input`  — the validated request body type (use `undefined` for GET handlers)
 * `Output` — the return value type
 *
 * **Type-level boundary enforcement:**
 * Importing a `ServerFn` into a `.client.ts` or `.page.tsx` file will trigger
 * a Rust compiler error at build time. At the TypeScript level, the type is
 * marked with a unique brand to make accidental misuse visible in editors.
 */
export type ServerFn<Input = undefined, Output = unknown> = {
  /** @internal brand — do not use */
  readonly __serverFnBrand: unique symbol;
  (ctx: ServerFnContext, input: Input): Promise<Output>;
};

/**
 * A client-callable reference to a server function.
 * This is what the Node.js layer wires up as an API route handler.
 */
export type ServerFnRef<Input = undefined, Output = unknown> = {
  /** URL of the generated API endpoint */
  readonly endpoint: string;
  /** Call the server function from the client via fetch */
  call(input: Input): Promise<Output>;
};

/**
 * A React page component accepted by Alab's file-system router.
 */
export type ClientPage<Props = Record<string, unknown>> = (props: Props) => React.ReactElement | null;

// Ensure React types are available for the ClientPage export
import type React from "react";
