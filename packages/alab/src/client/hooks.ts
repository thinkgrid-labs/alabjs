import { use } from "react";

/**
 * `useServerData` — consume server-fetched data in a React component.
 *
 * In SSR mode, the data is already embedded in the HTML stream.
 * In CSR mode, the data is fetched from the generated server function endpoint.
 *
 * @example
 * ```tsx
 * // users/[id].page.tsx
 * import { useServerData } from "alab/client";
 * import type { getUser } from "./[id].server"; // type-only import is allowed
 *
 * export default function UserPage() {
 *   const user = useServerData<Awaited<ReturnType<typeof getUser>>>("getUser");
 *   return <h1>{user.name}</h1>;
 * }
 * ```
 */
export function useServerData<T>(fnName: string, params?: Record<string, string>): T {
  const searchParams = new URLSearchParams(params).toString();
  const url = `/_alab/data/${fnName}${searchParams ? `?${searchParams}` : ""}`;

  // React 19 `use()` suspends until the promise resolves.
  const promise = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Server data fetch failed: ${r.status}`);
    return r.json() as Promise<T>;
  });

  return use(promise);
}
