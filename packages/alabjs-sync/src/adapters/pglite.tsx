/**
 * @alabjs/sync/pglite — PGlite adapter (SQLite in the browser via WASM).
 *
 * PGlite runs a full Postgres-compatible database entirely in the browser
 * with no server required. Data is persisted to IndexedDB (`idb://myapp`).
 * Ideal for offline-first apps and prototypes.
 *
 * Install peer dependency:
 * ```
 * npm i @electric-sql/pglite
 * ```
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { PGliteProvider } from "@alabjs/sync/pglite";
 * import { PGlite } from "@electric-sql/pglite";
 *
 * // Singleton — create once outside the component tree
 * const db = new PGlite("idb://myapp");
 *
 * export default function RootLayout({ children }) {
 *   return <PGliteProvider db={db}>{children}</PGliteProvider>;
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
import type { SyncQueryResult, SyncMutationHandle } from "../index.js";

// ─── PGlite duck-typed interface ──────────────────────────────────────────────
// We duck-type instead of importing @electric-sql/pglite directly so the
// adapter compiles without the peer dep installed.

interface PGliteRow {
  [col: string]: unknown;
}

interface PGliteQueryResult<T> {
  rows: T[];
}

interface PGliteInstance {
  query<T extends PGliteRow>(sql: string, params?: unknown[]): Promise<PGliteQueryResult<T>>;
  exec(sql: string, params?: unknown[]): Promise<void>;
  /** Live query subscription — available when using @electric-sql/pglite/live extension. */
  live?: {
    query<T extends PGliteRow>(
      sql: string,
      params: unknown[],
      callback: (result: PGliteQueryResult<T>) => void,
    ): Promise<{ unsubscribe: () => void }>;
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PGliteCtx = createContext<PGliteInstance | null>(null);

export interface PGliteProviderProps {
  /** A `PGlite` instance (created with `new PGlite("idb://myapp")`). */
  db: PGliteInstance;
  children: ReactNode;
}

/**
 * Provide a PGlite database instance to all child components.
 * Create the `PGlite` instance once outside the component tree.
 */
export function PGliteProvider({ db, children }: PGliteProviderProps) {
  return <PGliteCtx.Provider value={db}>{children}</PGliteCtx.Provider>;
}

/** Access the PGlite instance from context. Throws if used outside `<PGliteProvider>`. */
export function usePGlite(): PGliteInstance {
  const db = useContext(PGliteCtx);
  if (!db) throw new Error("[alabjs/sync] usePGlite must be used inside <PGliteProvider>");
  return db;
}

// ─── usePGliteQuery ───────────────────────────────────────────────────────────

/**
 * Run a reactive SQL query against PGlite.
 *
 * If the `live` extension is loaded on the `PGlite` instance, the result
 * updates automatically whenever the underlying tables change. Without the
 * extension, results are fetched once on mount.
 *
 * @example
 * ```tsx
 * const { rows, loading } = usePGliteQuery<{ id: number; title: string }>(
 *   "SELECT * FROM todos WHERE done = $1 ORDER BY id DESC",
 *   [false],
 * );
 * ```
 */
export function usePGliteQuery<T extends PGliteRow = PGliteRow>(
  sql: string,
  params: unknown[] = [],
): SyncQueryResult<T> {
  const db = usePGlite();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Serialize params for the effect dep array
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        if (db.live) {
          // Live query: subscribe and update on every change
          const sub = await db.live.query<T>(sql, params, (result) => {
            if (!cancelled) {
              setRows(result.rows);
              setLoading(false);
            }
          });
          return () => {
            cancelled = true;
            sub.unsubscribe();
          };
        } else {
          // One-shot query
          const result = await db.query<T>(sql, params);
          if (!cancelled) {
            setRows(result.rows);
            setLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      }
    };

    const cleanupPromise = run();
    return () => {
      cancelled = true;
      // Run the cleanup returned from live.query (if any)
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sql, paramsKey]);

  return { rows, loading, error };
}

// ─── usePGliteMutation ────────────────────────────────────────────────────────

/**
 * Execute a parameterised SQL mutation (INSERT / UPDATE / DELETE).
 *
 * @example
 * ```tsx
 * const add = usePGliteMutation("INSERT INTO todos (title) VALUES ($1)");
 * <button onClick={() => add.mutate(["Buy milk"])}>Add</button>
 * ```
 */
export function usePGliteMutation(sql: string): SyncMutationHandle & {
  mutate: (params?: unknown[]) => Promise<void>;
} {
  const db = usePGlite();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const sqlRef = useRef(sql);
  sqlRef.current = sql;

  const mutate = useCallback(async (params?: unknown[]) => {
    setIsPending(true);
    setError(null);
    try {
      await db.exec(sqlRef.current, params);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsPending(false);
    }
  }, [db]);

  return { mutate, isPending, error };
}
