/**
 * @alab/sync — Local-first sync engine adapters for Alab.
 *
 * Provides a common React context + hooks interface over three sync backends:
 *
 * | Backend    | Import                  | Best for                              |
 * |------------|-------------------------|---------------------------------------|
 * | PGlite     | `@alab/sync/pglite`     | Offline-first, no server required     |
 * | ElectricSQL| `@alab/sync/electric`   | Postgres → client sync (shapes)       |
 * | PowerSync  | `@alab/sync/powersync`  | Postgres/Supabase → SQLite in browser |
 *
 * Each adapter exports a `<SyncProvider>` and a `useSyncedQuery` / `useSyncedMutation`
 * pair that follows the same API regardless of the underlying engine.
 *
 * @example PGlite (zero-server, SQLite in the browser via WASM)
 * ```tsx
 * // app/layout.tsx
 * import { PGliteProvider } from "@alab/sync/pglite";
 * import { PGlite } from "@electric-sql/pglite";
 *
 * const db = new PGlite("idb://myapp"); // persisted in IndexedDB
 *
 * export default function RootLayout({ children }) {
 *   return <PGliteProvider db={db}>{children}</PGliteProvider>;
 * }
 *
 * // app/todos/page.tsx
 * import { usePGliteQuery, usePGliteMutation } from "@alab/sync/pglite";
 *
 * export default function TodosPage() {
 *   const { rows } = usePGliteQuery<{ id: number; title: string }>(
 *     "SELECT * FROM todos ORDER BY id DESC",
 *   );
 *   const add = usePGliteMutation("INSERT INTO todos (title) VALUES ($1)");
 *   return (
 *     <>
 *       {rows.map(t => <li key={t.id}>{t.title}</li>)}
 *       <button onClick={() => add.mutate(["Buy milk"])}>Add</button>
 *     </>
 *   );
 * }
 * ```
 */

// ─── Shared types ─────────────────────────────────────────────────────────────

/** Status of a sync connection. */
export type SyncStatus = "connecting" | "connected" | "disconnected" | "error";

/** Generic query result returned by all adapters. */
export interface SyncQueryResult<T> {
  rows: T[];
  /** True while the first query result is loading. */
  loading: boolean;
  /** Set if the query threw. */
  error: Error | null;
}

/** Generic mutation handle returned by all adapters. */
export interface SyncMutationHandle {
  mutate: (...params: unknown[]) => Promise<void>;
  isPending: boolean;
  error: Error | null;
}

// Re-export adapter entry points so callers can import from "@alab/sync" directly.
export type { PGliteProviderProps } from "./adapters/pglite.js";
export type { ElectricProviderProps } from "./adapters/electric.js";
export type { PowerSyncProviderProps } from "./adapters/powersync.js";
