/**
 * @alabjs/sync/electric — ElectricSQL adapter (Postgres → client shape sync).
 *
 * ElectricSQL syncs a subset of your Postgres data ("shapes") to the client
 * in real time. The client reads from a local in-memory cache that stays in
 * sync with the server via long-polling over HTTP — no WebSocket required.
 *
 * Install peer dependency:
 * ```
 * npm i @electric-sql/client
 * ```
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { ElectricProvider } from "@alabjs/sync/electric";
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <ElectricProvider url="https://my-electric-server.fly.dev">
 *       {children}
 *     </ElectricProvider>
 *   );
 * }
 *
 * // app/todos/page.tsx
 * import { useShape } from "@alabjs/sync/electric";
 *
 * export default function TodosPage() {
 *   const { data, isLoading } = useShape<{ id: string; title: string; done: boolean }>({
 *     url: "/todos",
 *     where: "done = false",
 *   });
 *   return <ul>{data.map(t => <li key={t.id}>{t.title}</li>)}</ul>;
 * }
 * ```
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { SyncStatus } from "../index.js";

// ─── ElectricSQL duck-typed interface ─────────────────────────────────────────

interface ShapeStreamOptions {
  url: string;
  where?: string;
  columns?: string[];
  offset?: string;
}

interface ShapeStreamMessage<T> {
  rows: T[];
  isUpToDate: boolean;
}

interface ShapeStreamInstance<T> {
  subscribe(callback: (msg: ShapeStreamMessage<T>) => void): () => void;
  unsubscribeAll(): void;
}

interface ElectricClientInstance {
  ShapeStream: new <T>(opts: ShapeStreamOptions) => ShapeStreamInstance<T>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ElectricCtxValue {
  url: string;
  client: ElectricClientInstance | null;
  status: SyncStatus;
}

const ElectricCtx = createContext<ElectricCtxValue>({
  url: "",
  client: null,
  status: "disconnected",
});

export interface ElectricProviderProps {
  /** Base URL of your Electric sync service (e.g. `https://sync.example.com`). */
  url: string;
  children: ReactNode;
}

/**
 * Provide an ElectricSQL connection to all child components.
 * Dynamically imports `@electric-sql/client` at runtime.
 */
export function ElectricProvider({ url, children }: ElectricProviderProps) {
  const [client, setClient] = useState<ElectricClientInstance | null>(null);
  const [status, setStatus] = useState<SyncStatus>("connecting");

  useEffect(() => {
    let cancelled = false;
    import("@electric-sql/client" as never as string).then((mod) => {
      if (cancelled) return;
      setClient(mod as ElectricClientInstance);
      setStatus("connected");
    }).catch(() => {
      if (!cancelled) setStatus("error");
    });
    return () => { cancelled = true; };
  }, [url]);

  return (
    <ElectricCtx.Provider value={{ url, client, status }}>
      {children}
    </ElectricCtx.Provider>
  );
}

export function useElectric(): ElectricCtxValue {
  return useContext(ElectricCtx);
}

// ─── useShape ─────────────────────────────────────────────────────────────────

export interface UseShapeOptions {
  /**
   * Table path relative to the Electric server URL (e.g. `"/todos"`).
   * Full URL is constructed as `<providerUrl><path>`.
   */
  url: string;
  /** Optional SQL WHERE clause to filter the shape (server-side). */
  where?: string;
  /** Columns to include. Defaults to all. */
  columns?: string[];
}

export interface UseShapeResult<T> {
  data: T[];
  isLoading: boolean;
  isUpToDate: boolean;
  error: Error | null;
  status: SyncStatus;
}

/**
 * Subscribe to an ElectricSQL shape — a live, filtered subset of a Postgres table.
 *
 * The hook re-renders automatically whenever the server pushes new changes.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useShape<Todo>({
 *   url: "/todos",
 *   where: "user_id = 'abc'",
 * });
 * ```
 */
export function useShape<T extends Record<string, unknown>>(
  opts: UseShapeOptions,
): UseShapeResult<T> {
  const { url: baseUrl, client, status: connStatus } = useElectric();
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpToDate, setIsUpToDate] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const optsKey = JSON.stringify(opts);

  useEffect(() => {
    if (!client) return;
    let unsubscribe: (() => void) | null = null;

    try {
      const stream = new client.ShapeStream<T>({
        url: `${baseUrl}${opts.url}`,
        where: opts.where,
        columns: opts.columns,
      });

      unsubscribe = stream.subscribe((msg) => {
        setData(msg.rows);
        setIsLoading(false);
        setIsUpToDate(msg.isUpToDate);
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
    }

    return () => { unsubscribe?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, baseUrl, optsKey]);

  return { data, isLoading, isUpToDate, error, status: connStatus };
}
