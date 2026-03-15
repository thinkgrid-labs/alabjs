---
title: Signals
description: Fine-grained reactive state with signal(), useSignal(), and useSignalValue().
---

AlabJS ships a tiny, framework-agnostic signal primitive built on `useSyncExternalStore`. Signals give you **cell-level reactivity** — only the component that reads a signal re-renders when it changes. No context, no prop drilling, no global store boilerplate.

## Creating a signal

```ts
import { signal } from "alabjs/signals";

// Create a signal with an initial value.
const count = signal(0);

// Read the current value anywhere (outside React):
console.log(count.get()); // 0

// Write a new value:
count.set(5);

// Update based on the previous value:
count.update((prev) => prev + 1);
```

Signals created at module scope are singletons — the same object is reused across renders. This makes them ideal for cross-component shared state.

## Reading a signal in a component

`useSignalValue` subscribes the component to the signal. The component re-renders only when the signal's value changes.

```tsx
import { useSignalValue } from "alabjs/signals";
import { count } from "./state";

export default function Counter() {
  const n = useSignalValue(count);
  return <p>Count: {n}</p>;
}
```

## Creating a local signal in a component

`useSignal` creates a signal that lives for the lifetime of the component instance. Useful as an ergonomic alternative to `useState` when you need to read the value outside of React (e.g. in an event listener).

```tsx
import { useSignal, useSignalValue } from "alabjs/signals";

export default function LocalCounter() {
  const count = useSignal(0);
  const n = useSignalValue(count);

  return (
    <button onClick={() => count.update((x) => x + 1)}>
      Clicked {n} times
    </button>
  );
}
```

## Derived signals

Combine multiple signals into a derived read-only value using `computed`:

```ts
import { signal, computed } from "alabjs/signals";

const a = signal(2);
const b = signal(3);
const sum = computed(() => a.get() + b.get());

console.log(sum.get()); // 5
a.set(10);
console.log(sum.get()); // 13
```

Computed signals are lazy — they recalculate only when read after a dependency changes.

## Effects

Run a side effect whenever signal values change:

```ts
import { effect } from "alabjs/signals";

const name = signal("Alice");

// Runs immediately and re-runs whenever `name` changes.
const stop = effect(() => {
  document.title = `Hello, ${name.get()}`;
});

// Stop the effect when it's no longer needed:
stop();
```

Effects are synchronous. They re-run in the same microtask as the signal update.

## API Reference

### `signal<T>(initial: T): Signal<T>`

Creates a new signal.

```ts
interface Signal<T> {
  get(): T;
  set(value: T): void;
  update(fn: (prev: T) => T): void;
  subscribe(listener: () => void): () => void;
}
```

### `computed<T>(fn: () => T): ReadonlySignal<T>`

Creates a lazily-evaluated derived signal. Tracks all signals read during `fn`.

### `effect(fn: () => void | (() => void)): () => void`

Runs `fn` immediately and re-runs it when any signal it reads changes. Returns a cleanup function. If `fn` returns a function, that function is called before the next re-run (cleanup pattern).

### `useSignal<T>(initial: T): Signal<T>`

React hook. Creates a signal tied to the component instance. Stable across re-renders.

### `useSignalValue<T>(signal: Signal<T> | ReadonlySignal<T>): T`

React hook. Subscribes the component to the signal via `useSyncExternalStore`. The component re-renders only when the signal value changes.

## When to use signals vs useState

| Scenario | Recommendation |
|---|---|
| Local component state | `useState` or `useSignal` — both work |
| Shared state across sibling components | `signal` at module scope |
| State that needs to be read outside React (event listeners, timers) | `signal` |
| High-frequency updates (canvas, animation) | `signal` — avoids React reconciler overhead |
| Server state (API data) | `useServerData` |
