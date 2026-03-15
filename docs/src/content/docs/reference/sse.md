---
title: Server-Sent Events
description: Real-time server-to-client streaming with defineSSEHandler and useSSE.
sidebar:
  order: 3
---

AlabJS has first-class support for Server-Sent Events (SSE) — a lightweight, HTTP-native protocol for pushing data from the server to the browser. Unlike WebSockets, SSE works over a standard HTTP connection, passes through any proxy, and reconnects automatically.

## Defining an SSE handler

Use `defineSSEHandler` in an API route (`app/.../route.ts`) to turn an async generator into an SSE stream:

```ts
// app/prices/route.ts
import { defineSSEHandler } from "alabjs/server";

export const GET = defineSSEHandler(async function* (req) {
  // Stream a new price every second
  while (true) {
    const price = await fetchLatestPrice();
    yield { data: price };
    await sleep(1000);
  }
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
```

The generator yields `SSEEvent<T>` objects:

```ts
interface SSEEvent<T> {
  /** Named event (default: "message"). */
  event?: string;
  /** The payload — will be JSON-serialised. */
  data: T;
  /** Optional event ID for reconnect tracking. */
  id?: string;
  /** Retry interval in ms the browser should use on reconnect. */
  retry?: number;
}
```

AlabJS handles all the encoding, headers (`content-type: text/event-stream`, `cache-control: no-cache`), and connection cleanup automatically.

## Consuming SSE in a component

```tsx
import { useSSE } from "alabjs/client";

interface Price {
  symbol: string;
  usd: number;
}

export default function PriceTicker() {
  const { data, readyState } = useSSE<Price>("/prices");

  if (readyState === "connecting") return <p>Connecting...</p>;
  if (!data) return null;

  return (
    <p>
      {data.symbol}: ${data.usd.toFixed(2)}
    </p>
  );
}
```

## Named events

You can send multiple event types over a single SSE connection:

```ts
// Server
yield { event: "price", data: { usd: 42.5 } };
yield { event: "status", data: { market: "open" } };
```

```tsx
// Client — subscribe to a specific event name
const { data } = useSSE<Status>("/prices", { event: "status" });
```

## Closing the stream

The stream closes when the client disconnects (the browser closes the tab, or your component unmounts). You can also close it from the server by returning from the generator:

```ts
export const GET = defineSSEHandler(async function* (req) {
  for (let i = 0; i < 10; i++) {
    yield { data: i };
    await sleep(500);
  }
  // Generator returns — stream closes cleanly.
});
```

The `useSSE` hook also exposes a `close()` function:

```tsx
const { data, close } = useSSE<T>("/stream");

<button onClick={close}>Stop</button>
```

## API Reference

### `defineSSEHandler<T>(generator): (req: Request) => Response`

Wraps an async generator into a standard SSE `Response`. Use as a named export (`GET`, `POST`, etc.) in an API route file.

The generator receives the raw `Request` object and yields `SSEEvent<T>` objects.

### `useSSE<T>(url: string, options?): UseSSEResult<T>`

React hook. Opens an `EventSource` to `url` and returns the latest event data.

```ts
interface UseSSEOptions {
  /** Named event to listen for (default: "message"). */
  event?: string;
  /** Whether to open the connection (default: true). */
  enabled?: boolean;
  /** Called when a new event arrives. */
  onMessage?: (data: T, id: string | null) => void;
  /** Called when the connection errors or closes. */
  onError?: (e: Event) => void;
}

interface UseSSEResult<T> {
  data: T | null;
  lastEventId: string | null;
  readyState: "connecting" | "open" | "closed";
  close: () => void;
}
```

## Authentication

`EventSource` does not support custom request headers. To authenticate SSE streams, pass credentials via a query parameter or a cookie:

```ts
// Server
export const GET = defineSSEHandler(async function* (req) {
  const token = new URL(req.url).searchParams.get("token");
  if (!isValidToken(token)) return; // Immediately closes stream
  // ...
});
```

```tsx
// Client
const { data } = useSSE(`/api/stream?token=${authToken}`);
```

For cookie-based auth (recommended), the `EventSource` automatically sends cookies for the same origin — no extra setup needed.
