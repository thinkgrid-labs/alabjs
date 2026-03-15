/**
 * @alabjs/sync/powersync — PowerSync adapter (Postgres/Supabase → SQLite in browser).
 *
 * PowerSync syncs your Postgres (or Supabase) data to a local SQLite database
 * running in the browser via WASM. Supports offline writes that sync back when
 * connectivity is restored.
 *
 * Install peer dependency:
 * ```
 * npm i @powersync/web
 * ```
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { PowerSyncProvider } from "@alabjs/sync/powersync";
 * import { PowerSyncDatabase, WASQLiteOpenFactory } from "@powersync/web";
 * import { AppSchema } from "../lib/schema";
 * import { SupabaseConnector } from "../lib/connector";
 *
 * const db = new PowerSyncDatabase({
 *   schema: AppSchema,
 *   database: new WASQLiteOpenFactory({ dbFilename: "myapp.db" }),
 * });
 * await db.connect(new SupabaseConnector());
 *
 * export default function RootLayout({ children }) {
 *   return <PowerSyncProvider db={db}>{children}</PowerSyncProvider>;
 * }
 *
 * // app/todos/page.tsx
 * import { usePowerSyncQuery, usePowerSyncMutation } from "@alabjs/sync/powersync";
 *
 * export default function TodosPage() {
 *   const { rows } = usePowerSyncQuery<{ id: string; title: string }>(
 *     "SELECT * FROM todos ORDER BY created_at DESC",
 *   );
 *   const add = usePowerSyncMutation();
 *   return (
 *     <>
 *       {rows.map(t => <li key={t.id}>{t.title}</li>)}
 *       <button onClick={() => add.mutate("INSERT INTO todos (id, title) VALUES (uuid(), ?)", ["Buy milk"])}>
 *         Add
 *       </button>
 *     </>
 *   );
 * }
 * ```
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { SyncQueryResult, SyncMutationHandle, SyncStatus } from "../index.js";

// ─── PowerSync duck-typed interface ───────────────────────────────────────────

interface PowerSyncRow {
  [col: string]: unknown;
}

interface PowerSyncQueryResult<T> {
  rows: { _array: T[] };
}

interface PowerSyncWatchCallback<T> {
  onResult: (result: PowerSyncQueryResult<T>) => void;
  onError?: (err: Error) => void;
}

interface PowerSyncInstance {
  execute(sql: string, params?: unknown[]): Promise<void>;
  getAll<T extends PowerSyncRow>(sql: string, params?: unknown[]): Promise<T[]>;
  watch<T extends PowerSyncRow>(
    sql: string,
    params: unknown[],
    callbacks: PowerSyncWatchCallback<T>,
  ): { unsubscribe: () => void };
  currentStatus?: { connected: boolean };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PowerSyncCtx = createContext<PowerSyncInstance | null>(null);

export interface PowerSyncProviderProps {
  /** An initialised and connected `PowerSyncDatabase` instance. */
  db: PowerSyncInstance;
  children: ReactNode;
}

/**
 * Provide a PowerSync database to all child components.
 * Connect + initialise the database before passing it in.
 */
export function PowerSyncProvider({ db, children }: PowerSyncProviderProps) {
  return <PowerSyncCtx.Provider value={db}>{children}</PowerSyncCtx.Provider>;
}

/** Access the raw PowerSync instance from context. */
export function usePowerSync(): PowerSyncInstance {
  const db = useContext(PowerSyncCtx);
  if (!db) throw new Error("[alabjs/sync] usePowerSync must be used inside <PowerSyncProvider>");
  return db;
}

/** Returns the current sync connection status. */
export function usePowerSyncStatus(): SyncStatus {
  const db = usePowerSync();
  const [status, setStatus] = useState<SyncStatus>(
    db.currentStatus?.connected ? "connected" : "connecting",
  );

  useEffect(() => {
    // Poll lightweight status — PowerSync exposes currentStatus synchronously
    const id = setInterval(() => {
      setStatus(db.currentStatus?.connected ? "connected" : "disconnected");
    }, 2_000);
    return () => clearInterval(id);
  }, [db]);

  return status;
}

// ─── usePowerSyncQuery ────────────────────────────────────────────────────────

/**
 * Run a reactive SQL query against the local PowerSync SQLite database.
 *
 * The hook re-renders automatically whenever the underlying tables change
 * (via PowerSync's `watch` API).
 *
 * @example
 * ```tsx
 * const { rows, loading } = usePowerSyncQuery<{ id: string; title: string }>(
 *   "SELECT * FROM todos WHERE done = ? ORDER BY created_at DESC",
 *   [0],
 * );
 * ```
 */
export function usePowerSyncQuery<T extends PowerSyncRow = PowerSyncRow>(
  sql: string,
  params: unknown[] = [],
): SyncQueryResult<T> {
  const db = usePowerSync();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    const sub = db.watch<T>(sql, params, {
      onResult(result) {
        setRows(result.rows._array);
        setLoading(false);
      },
      onError(err) {
        setError(err);
        setLoading(false);
      },
    });
    return () => sub.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sql, paramsKey]);

  return { rows, loading, error };
}

// ─── usePowerSyncMutation ─────────────────────────────────────────────────────

/**
 * Execute a SQL mutation (INSERT / UPDATE / DELETE) against the local SQLite
 * database. PowerSync syncs it back to Postgres automatically.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = usePowerSyncMutation();
 * <button onClick={() => mutate("INSERT INTO todos (id, title) VALUES (uuid(), ?)", ["Walk dog"])}>
 *   Add
 * </button>
 * ```
 */
export function usePowerSyncMutation(): SyncMutationHandle & {
  mutate: (sql: string, params?: unknown[]) => Promise<void>;
} {
  const db = usePowerSync();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const dbRef = useRef(db);
  dbRef.current = db;

  const mutate = useCallback(async (sql: string, params?: unknown[]) => {
    setIsPending(true);
    setError(null);
    try {
      await dbRef.current.execute(sql, params);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsPending(false);
    }
  }, []);

  return { mutate, isPending, error };
}
