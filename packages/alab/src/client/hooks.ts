import { use } from "react";
import type { ServerFn, InferServerOutput, RouteParams, InferServerPath } from "../types/index.js";

/**
 * Fetch server data with full type inference from a `ServerFn`.
 *
 * Use `import type` to reference the server function — type-only imports
 * are erased at compile time and never cross the server/client boundary.
 *
 * @example
 * ```tsx
 * // app/posts/[id]/page.tsx
 * import type { getPost } from "./page.server"; // ← import type, safe
 * import { useServerData } from "alab/client";
 *
 * export default function PostPage({ params }: { params: { id: string } }) {
 *   // Return type is inferred from getPost — no manual type annotation needed
 *   const post = useServerData<typeof getPost>("getPost", params);
 *   post.title; // ✅ typed
 *   post.foo;   // ✅ TS error — doesn't exist on the return type
 * }
 * ```
 */
export function useServerData<T extends ServerFn<any, any, any>>(
  fnName: string,
  params?: RouteParams<InferServerPath<T>>,
): InferServerOutput<T> {
  const searchParams = params
    ? new URLSearchParams(params as Record<string, string>).toString()
    : "";
  const url = `/_alab/data/${fnName}${searchParams ? `?${searchParams}` : ""}`;

  const promise = fetch(url).then((r): Promise<InferServerOutput<T>> => {
    if (!r.ok) throw new Error(`[alab] server data fetch failed: ${r.status} ${r.statusText} — ${url}`);
    return r.json() as Promise<InferServerOutput<T>>;
  });

  return use(promise);
}

/**
 * Trigger a server function mutation from the client.
 *
 * For complex scenarios (optimistic updates, retries, caching) use
 * TanStack Query's `useMutation` or `@alab/query` instead.
 *
 * @example
 * ```tsx
 * import type { createPost } from "./page.server";
 * import { useMutation } from "alab/client";
 *
 * const { mutate, isPending } = useMutation<typeof createPost>("createPost");
 * ```
 */
export function useMutation<T extends ServerFn<any, any, any>>(fnName: string) {
  type Input = T extends ServerFn<infer I, any, any> ? I : never;
  type Output = InferServerOutput<T>;

  const mutate = async (input: Input): Promise<Output> => {
    const r = await fetch(`/_alab/fn/${fnName}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error(`[alab] mutation failed: ${r.status} ${r.statusText}`);
    return r.json() as Promise<Output>;
  };

  return { mutate };
}
