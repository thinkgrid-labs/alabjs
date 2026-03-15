/**
 * Alab Signals — granular reactivity within a React tree.
 *
 * Signals are observable values that trigger precise re-renders only in the
 * components that read them — no context provider needed, no full-tree
 * reconciliation. Inspired by SolidJS signals, built on React 18's
 * `useSyncExternalStore` for correctness in concurrent mode.
 *
 * @example
 * ```ts
 * // signals.ts — define once, use anywhere
 * import { signal } from "alab/signals";
 *
 * export const count = signal(0);
 * export const user = signal<User | null>(null);
 * ```
 *
 * ```tsx
 * // Counter.tsx — only this component re-renders when count changes
 * import { useSignal } from "alab/signals";
 * import { count } from "../signals.js";
 *
 * export function Counter() {
 *   const [value, setCount] = useSignal(count);
 *   return <button onClick={() => setCount(v => v + 1)}>{value}</button>;
 * }
 * ```
 */

import { useSyncExternalStore, useCallback } from "react";

// ─── Signal primitive ─────────────────────────────────────────────────────────

export interface Signal<T> {
  /** Read the current value (non-reactive — use `useSignalValue` inside components). */
  get(): T;
  /** Write a new value and notify all subscribers. */
  set(value: T | ((prev: T) => T)): void;
  /** @internal Subscribe to changes — consumed by `useSyncExternalStore`. */
  subscribe(listener: () => void): () => void;
  /** @internal Snapshot getter for SSR — returns current value synchronously. */
  getSnapshot(): T;
}

/**
 * Create a new signal with an initial value.
 *
 * Signals are plain objects — they don't require a React tree to exist.
 * Define them at module scope and import them wherever needed.
 *
 * @example
 * ```ts
 * export const darkMode = signal(false);
 * export const cart = signal<CartItem[]>([]);
 * ```
 */
export function signal<T>(initial: T): Signal<T> {
  let _value = initial;
  const _listeners = new Set<() => void>();

  const notify = () => _listeners.forEach((l) => l());

  return {
    get() {
      return _value;
    },
    set(next) {
      const resolved = typeof next === "function"
        ? (next as (prev: T) => T)(_value)
        : next;
      if (Object.is(resolved, _value)) return; // bail if unchanged
      _value = resolved;
      notify();
    },
    subscribe(listener) {
      _listeners.add(listener);
      return () => _listeners.delete(listener);
    },
    getSnapshot() {
      return _value;
    },
  };
}

// ─── React hooks ──────────────────────────────────────────────────────────────

/**
 * Subscribe to a signal's value — re-renders only when the signal changes.
 * Returns `[value, setter]`, matching the `useState` API.
 *
 * @example
 * ```tsx
 * const [isDark, setDark] = useSignal(darkMode);
 * <button onClick={() => setDark(v => !v)}>{isDark ? "☀️" : "🌙"}</button>
 * ```
 */
export function useSignal<T>(sig: Signal<T>): [T, (value: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(sig.subscribe, sig.getSnapshot, sig.getSnapshot);
  // Stable setter — signal.set is already referentially stable
  const set = useCallback((next: T | ((prev: T) => T)) => sig.set(next), [sig]);
  return [value, set];
}

/**
 * Subscribe to a signal's value (read-only).
 * Slightly cheaper than `useSignal` when you only need to read.
 *
 * @example
 * ```tsx
 * const count = useSignalValue(counter);
 * return <span>{count}</span>;
 * ```
 */
export function useSignalValue<T>(sig: Signal<T>): T {
  return useSyncExternalStore(sig.subscribe, sig.getSnapshot, sig.getSnapshot);
}

/**
 * Returns a stable setter for a signal without subscribing to its value.
 * Use this in components that only write but never display the signal's value —
 * they won't re-render when the signal changes.
 *
 * @example
 * ```tsx
 * const setCount = useSignalSetter(counter);
 * return <button onClick={() => setCount(v => v + 1)}>Increment</button>;
 * ```
 */
export function useSignalSetter<T>(sig: Signal<T>): (value: T | ((prev: T) => T)) => void {
  return useCallback((next: T | ((prev: T) => T)) => sig.set(next), [sig]);
}

/**
 * Derive a computed value from one or more signals.
 * The derived signal updates automatically when any source signal changes.
 *
 * @example
 * ```ts
 * const firstName = signal("Ada");
 * const lastName = signal("Lovelace");
 * const fullName = computed([firstName, lastName], ([f, l]) => `${f} ${l}`);
 * // fullName.get() === "Ada Lovelace"
 * ```
 */
export function computed<Sources extends Signal<any>[], T>(
  sources: [...Sources],
  derive: (values: { [K in keyof Sources]: Sources[K] extends Signal<infer V> ? V : never }) => T,
): Omit<Signal<T>, "set"> {
  // Read initial value
  const readValues = () =>
    sources.map((s) => s.get()) as { [K in keyof Sources]: Sources[K] extends Signal<infer V> ? V : never };

  let _cached = derive(readValues());
  const _listeners = new Set<() => void>();

  const recompute = () => {
    const next = derive(readValues());
    if (!Object.is(next, _cached)) {
      _cached = next;
      _listeners.forEach((l) => l());
    }
  };

  // Subscribe to all source signals
  for (const src of sources) {
    src.subscribe(recompute);
  }

  return {
    get() { return _cached; },
    getSnapshot() { return _cached; },
    subscribe(listener) {
      _listeners.add(listener);
      return () => _listeners.delete(listener);
    },
  };
}
