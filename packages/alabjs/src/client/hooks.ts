import { use, useReducer, useTransition, useCallback, useState, useEffect, useRef } from "react";
import type { ServerFn, InferServerOutput, RouteParams, InferServerPath } from "../types/index.js";

// Promise cache keyed by URL.
// • On the SERVER: cleared before each page render (via _clearALabSSRCache) so
//   re-renders after Suspense resolution return the same promise object, which
//   is required for renderToPipeableStream to correctly resolve Suspense.
// • On the CLIENT: intentionally persists for the session to avoid redundant
//   network round-trips on subsequent re-renders.
const _promiseCache = new Map<string, Promise<unknown>>();

/** Clear the server-side promise cache between SSR renders. Called by alab's dev server. */
export function _clearALabSSRCache(): void {
  _promiseCache.clear();
}

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
 * import { useServerData } from "alabjs/client";
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
  // When running in Node.js (SSR) fetch requires an absolute URL.
  // Alab's dev/prod server sets ALAB_ORIGIN before rendering each page.
  const origin =
    typeof window !== "undefined"
      ? ""
      : (process.env["ALAB_ORIGIN"] ?? "http://localhost:3000");

  const url = `${origin}/_alabjs/data/${fnName}${searchParams ? `?${searchParams}` : ""}`;

  let promise = _promiseCache.get(url) as Promise<InferServerOutput<T>> | undefined;
  if (!promise) {
    promise = fetch(url).then((r): Promise<InferServerOutput<T>> => {
      if (!r.ok) throw new Error(`[alabjs] server data fetch failed: ${r.status} ${r.statusText} — ${url}`);
      return r.json() as Promise<InferServerOutput<T>>;
    });
    _promiseCache.set(url, promise);
  }

  return use(promise);
}

// ─── Mutation state machine ────────────────────────────────────────────────────

type MutationState<Output> =
  | { status: "idle";    data: undefined; error: undefined; zodError: undefined }
  | { status: "pending"; data: undefined; error: undefined; zodError: undefined }
  | { status: "success"; data: Output;   error: undefined; zodError: undefined }
  | { status: "error";   data: undefined; error: Error;    zodError: undefined }
  | { status: "invalid"; data: undefined; error: undefined; zodError: unknown };

type MutationAction<Output> =
  | { type: "start" }
  | { type: "success"; data: Output }
  | { type: "error"; error: Error }
  | { type: "invalid"; zodError: unknown }
  | { type: "reset" };

function mutationReducer<Output>(
  _state: MutationState<Output>,
  action: MutationAction<Output>,
): MutationState<Output> {
  switch (action.type) {
    case "start":   return { status: "pending", data: undefined, error: undefined, zodError: undefined };
    case "success": return { status: "success", data: action.data, error: undefined, zodError: undefined };
    case "error":   return { status: "error",   data: undefined, error: action.error, zodError: undefined };
    case "invalid": return { status: "invalid", data: undefined, error: undefined, zodError: action.zodError };
    case "reset":   return { status: "idle",    data: undefined, error: undefined, zodError: undefined };
  }
}

// ─── useMutation options ───────────────────────────────────────────────────────

export interface UseMutationOptions<Output, Input> {
  /**
   * Compute an optimistic value from the input immediately — before the server
   * responds. The component sees this value via `optimisticData` while the
   * request is in flight.
   *
   * On server error, `optimisticData` is cleared and `onError` is called with
   * a `rollback` callback you can use to undo any local side effects.
   */
  optimistic?: (input: Input) => Partial<Output>;
  /** Called when the mutation succeeds with the server response. */
  onSuccess?: (data: Output) => void;
  /**
   * Called when the mutation fails.
   * `rollback()` clears the optimistic value and resets state to idle.
   */
  onError?: (err: Error, rollback: () => void) => void;
}

/**
 * Trigger a server function mutation from the client, with full async state
 * and optional optimistic updates.
 *
 * @example
 * ```tsx
 * import type { updateTodo } from "./page.server";
 * import { useMutation } from "alabjs/client";
 *
 * // Basic
 * const { mutate, data, isPending, error, zodError, reset } =
 *   useMutation<typeof updateTodo>("updateTodo");
 *
 * // With optimistic update
 * const { mutate, optimisticData } = useMutation<typeof updateTodo>("updateTodo", {
 *   optimistic: (input) => ({ ...currentTodo, ...input }),
 *   onError: (err, rollback) => rollback(),
 * });
 * ```
 */
export function useMutation<T extends ServerFn<any, any, any>>(
  fnName: string,
  options?: UseMutationOptions<InferServerOutput<T>, T extends ServerFn<infer I, any, any> ? I : never>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Input = T extends ServerFn<infer I, any, any> ? I : never;
  type Output = InferServerOutput<T>;

  const [state, dispatch] = useReducer(
    mutationReducer<Output>,
    { status: "idle", data: undefined, error: undefined, zodError: undefined } as MutationState<Output>,
  );

  // Optimistic value lives in separate state so it can be cleared independently.
  const [optimisticData, setOptimisticData] = useState<Partial<Output> | undefined>(undefined);

  const [isPending, startTransition] = useTransition();

  const rollback = useCallback(() => {
    setOptimisticData(undefined);
    dispatch({ type: "reset" });
  }, []);

  const mutate = useCallback((input: Input): void => {
    dispatch({ type: "start" });

    if (options?.optimistic) {
      setOptimisticData(options.optimistic(input));
    }

    startTransition(() => {
      void (async () => {
        try {
          const r = await fetch(`/_alabjs/fn/${fnName}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          });

          // Zod validation error from server
          if (r.status === 422) {
            const body = await r.json() as { zodError: unknown };
            setOptimisticData(undefined);
            dispatch({ type: "invalid", zodError: body["zodError"] });
            return;
          }

          if (!r.ok) throw new Error(`[alabjs] mutation failed: ${r.status} ${r.statusText}`);

          const data = await r.json() as Output;
          setOptimisticData(undefined);
          dispatch({ type: "success", data });
          options?.onSuccess?.(data);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          setOptimisticData(undefined);
          dispatch({ type: "error", error });
          options?.onError?.(error, rollback);
        }
      })();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fnName, rollback]);

  const reset = useCallback(() => {
    setOptimisticData(undefined);
    dispatch({ type: "reset" });
  }, []);

  return {
    mutate,
    data: state.data as Output | undefined,
    /** Present when `optimistic` option is set and the request is in flight. */
    optimisticData,
    isPending: isPending || state.status === "pending",
    error: state.error as Error | undefined,
    /** Zod validation errors returned by `defineServerFn` schema checks (HTTP 422). */
    zodError: state.zodError,
    isSuccess: state.status === "success",
    isError: state.status === "error",
    isInvalid: state.status === "invalid",
    reset,
  };
}

// ─── useSSE ───────────────────────────────────────────────────────────────────

/** Possible connection states matching the browser EventSource readyState values. */
export type SSEReadyState = "connecting" | "open" | "closed";

export interface UseSSEOptions {
  /** Named event to subscribe to. Defaults to `"message"`. */
  event?: string;
  /** Whether to connect immediately. Set `false` to defer. @default true */
  enabled?: boolean;
  /** Called once when the EventSource opens. */
  onOpen?: () => void;
  /** Called when the EventSource closes or errors. */
  onError?: (err: Event) => void;
}

export interface UseSSEResult<T> {
  /** Most recently received event data (parsed JSON). `undefined` until first event. */
  data: T | undefined;
  /** The `lastEventId` string from the most recent event. */
  lastEventId: string;
  readyState: SSEReadyState;
  /** Close the EventSource and stop listening. */
  close: () => void;
}

/**
 * Subscribe to a server-sent event stream from a `defineSSEHandler` route.
 *
 * The EventSource is created when the component mounts and closed on unmount.
 * Data is parsed as JSON automatically.
 *
 * @example
 * ```tsx
 * import { useSSE } from "alabjs/client";
 *
 * export default function PricesPage() {
 *   const { data, readyState } = useSSE<{ ticker: string; price: number }>(
 *     "/api/prices?ticker=BTC",
 *     { event: "price" },
 *   );
 *
 *   return <div>{readyState === "open" ? data?.price ?? "—" : "connecting…"}</div>;
 * }
 * ```
 */
export function useSSE<T = unknown>(
  url: string,
  options: UseSSEOptions = {},
): UseSSEResult<T> {
  const { event = "message", enabled = true, onOpen, onError } = options;

  const [data, setData] = useState<T | undefined>(undefined);
  const [lastEventId, setLastEventId] = useState("");
  const [readyState, setReadyState] = useState<SSEReadyState>("connecting");

  // Keep callbacks stable across renders without re-subscribing
  const onOpenRef = useRef(onOpen);
  const onErrorRef = useRef(onError);
  onOpenRef.current = onOpen;
  onErrorRef.current = onError;

  const esRef = useRef<EventSource | null>(null);

  const close = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setReadyState("closed");
  }, []);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;

    const es = new EventSource(url);
    esRef.current = es;
    setReadyState("connecting");

    es.addEventListener("open", () => {
      setReadyState("open");
      onOpenRef.current?.();
    });

    es.addEventListener(event, (e: MessageEvent) => {
      setLastEventId(e.lastEventId ?? "");
      try {
        setData(e.data ? (JSON.parse(e.data) as T) : undefined);
      } catch {
        setData(e.data as unknown as T);
      }
    });

    es.addEventListener("error", (e) => {
      onErrorRef.current?.(e);
      if (es.readyState === EventSource.CLOSED) {
        setReadyState("closed");
      }
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  // Re-subscribe if url or event type changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, event, enabled]);

  return { data, lastEventId, readyState, close };
}
