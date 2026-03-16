import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Load a component from a federated remote application using native browser ESM.
 *
 * The specifier is resolved at runtime via the `<script type="importmap">` that
 * AlabJS injects into every page when `federation.remotes` is set in
 * `alabjs.config.ts`. No bundler runtime shim is required.
 *
 * The returned component is a `React.lazy` wrapper — wrap it in a `<Suspense>`
 * boundary to handle the async load:
 *
 * @example
 * ```tsx
 * // alabjs.config.ts
 * export default defineConfig({
 *   federation: {
 *     name: "host",
 *     remotes: { "RemoteApp": "https://remote.example.com" },
 *   },
 * });
 *
 * // app/page.tsx
 * import { useFederatedComponent } from "alabjs/client";
 * import { Suspense } from "react";
 *
 * const RemoteButton = useFederatedComponent("RemoteApp/Button");
 *
 * export default function Page() {
 *   return (
 *     <Suspense fallback={<span>Loading…</span>}>
 *       <RemoteButton variant="primary">Click me</RemoteButton>
 *     </Suspense>
 *   );
 * }
 * ```
 *
 * @param specifier - Module specifier in `"RemoteName/ExposedName"` format.
 *   Must match a key in the remote's `federation.exposes` config.
 */
export function useFederatedComponent<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends ComponentType<any> = ComponentType<Record<string, unknown>>,
>(specifier: string): LazyExoticComponent<T> {
  return lazy(
    () =>
      // @vite-ignore: resolved at runtime via the host page's import map —
      // Vite must not try to statically analyse or bundle this specifier.
      import(/* @vite-ignore */ specifier).then(
        (mod: { default?: T } & Record<string, unknown>) => ({
          default: (mod.default ?? mod) as T,
        }),
      ) as Promise<{ default: T }>,
  );
}
