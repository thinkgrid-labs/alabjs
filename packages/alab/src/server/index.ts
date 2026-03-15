import type { ServerFn, ServerFnContext } from "../types/index.js";

/**
 * Define a server-only function.
 *
 * At build time, Alab's Rust compiler:
 * 1. Detects any `.server.ts` file that exports `defineServerFn` calls.
 * 2. Strips the implementation from the client bundle.
 * 3. Generates an API route handler at `/_alab/fn/<hash>`.
 * 4. Replaces the export with a lightweight `ServerFnRef` on the client side.
 *
 * At the TypeScript level, the return type is branded so importing it into
 * a client file surfaces a type error in your editor before the build runs.
 *
 * @example
 * ```ts
 * // users/[id].server.ts
 * import { defineServerFn } from "alab/server";
 *
 * export const getUser = defineServerFn(async ({ params }) => {
 *   return db.users.findById(params.id);
 * });
 * ```
 */
export function defineServerFn<Input = undefined, Output = unknown>(
  handler: (ctx: ServerFnContext, input: Input) => Promise<Output>,
): ServerFn<Input, Output> {
  // At runtime on the server, this is the actual handler.
  // The Rust compiler replaces this with a stub on the client bundle.
  return handler as unknown as ServerFn<Input, Output>;
}
