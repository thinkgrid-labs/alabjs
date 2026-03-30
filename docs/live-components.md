---
title: Live Components
description: Server-rendered HTML fragments that update in real time over SSE — no client state, no polling loop.
---

# Live Components

A **live component** is a React component that runs entirely on the server and streams updated HTML to the browser over a persistent SSE connection. The browser patches the DOM directly — no React re-renders, no client-side data fetching, no polling.

Use live components when:
- Data changes frequently and the server is the source of truth (stock prices, sensor readings, feed counts)
- You want real-time updates without shipping the data-fetching logic to the browser
- The component is read-only from the user's perspective (dashboards, feeds, tickers)

---

## Convention

There are two ways to mark a component as live.

### File naming (recommended)

Name the file `*.live.tsx` or `*.live.ts`:

```
app/
  stock-ticker.live.tsx     ← automatically treated as a live component
  alerts-feed.live.tsx
```

### Directive (any file)

Add `"use live"` as the first statement in any `.tsx`/`.ts` file:

```tsx
"use live";

export default function StockTicker() { ... }
```

Both conventions produce the same result. File naming is preferred because it is visible in the directory listing without opening the file.

---

## `liveInterval`

Export `liveInterval` (seconds) to have the server re-render and push a new HTML fragment on a timer.

```tsx
// app/stock-ticker.live.tsx
export const liveInterval = 3; // push new HTML every 3 seconds

export default function StockTicker({ ticker }: { ticker: string }) {
  const quote = getQuote(ticker); // server-only — never sent to browser
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-gray-500">{ticker}</p>
      <p className="text-2xl font-bold">${quote.price.toFixed(2)}</p>
      <p className={quote.change >= 0 ? "text-green-500" : "text-red-500"}>
        {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)}%
      </p>
    </div>
  );
}
```

The minimum interval is `1` second. Omitting `liveInterval` means the component only updates when its tags are invalidated.

---

## `liveTags` and `invalidateLive`

Export `liveTags` to declare which cache tags trigger a push. Call `invalidateLive({ tags })` from any server route or server function to trigger all live components listening to those tags.

```tsx
// app/alerts-feed.live.tsx
export const liveTags = ["alerts"]; // no liveInterval — only push on tag invalidation

export default function AlertsFeed() {
  const alerts = getRecentAlerts();
  return (
    <ul className="space-y-2">
      {alerts.map((a) => (
        <li key={a.id} className="rounded border p-3 text-sm">
          {a.message}
        </li>
      ))}
    </ul>
  );
}
```

Trigger from a server route (e.g. after a mutation):

```ts
// app/api/alerts/route.ts
import { invalidateLive } from "alabjs/server";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  await db.alerts.create(body);

  // Push updated HTML to all connected AlertsFeed instances
  await invalidateLive({ tags: ["alerts"] });

  return Response.json({ ok: true });
}
```

You can combine both `liveInterval` and `liveTags` on the same component.

---

## Using a Live Component in a Page

Import and render it like any React component. Props are serialized and forwarded to the server renderer on every tick.

```tsx
// app/page.tsx
import StockTicker from "./stock-ticker.live";
import AlertsFeed from "./alerts-feed.live";

export const ssr = true; // optional — enable for SEO / initial paint

export default function Dashboard() {
  const tickers = ["AAPL", "MSFT", "TSLA"];

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">Market Overview</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {tickers.map((t) => (
          <StockTicker key={t} ticker={t} />
        ))}
      </div>

      <AlertsFeed />
    </main>
  );
}
```

---

## How It Works

```
Browser                          Server
  │                                │
  │  GET /dashboard                │
  │ ─────────────────────────────► │
  │                                │ SSR renders page
  │                                │ live components render initial HTML
  │  ◄──────────── HTML ────────── │
  │                                │
  │  GET /_alabjs/live/<id>?props=… │  (EventSource opened by LiveMount)
  │ ─────────────────────────────► │
  │                                │
  │  ◄─── event: data (HTML) ───── │  every liveInterval seconds
  │                                │   + whenever tags are invalidated
  │  DOM patched (no React)        │
  │                                │
  │  [component unmounts]          │
  │  EventSource.close()           │
```

### Initial render (SSR pages)

When `export const ssr = true` is on the parent page, the live component renders its full HTML on the server for the initial response. The client wrapper uses `suppressHydrationWarning` so React preserves those server-rendered children until the first SSE update arrives.

### Initial render (CSR pages)

On client-only pages, `LiveMount` opens the SSE connection immediately. The server pushes the first HTML fragment within one render cycle.

---

## Props

Props are passed through normally. They are serialized to JSON, base64-encoded, and sent as a query parameter on the SSE URL. Keep props small and serializable — complex objects, functions, and class instances are not supported.

```tsx
// ✅ serializable props
<StockTicker ticker="AAPL" precision={2} />

// ✗ not serializable — will be lost
<StockTicker onUpdate={() => {}} client={new ApiClient()} />
```

Props are fixed at mount time. If the parent re-renders with different props the SSE connection is not re-opened (the `id` stays constant). For prop-driven re-subscription, unmount and remount the component with a `key` prop.

---

## Error Handling

If the server throws during a live render, it emits an `event: error` SSE message. The browser logs the error and shows a red placeholder in the component slot. The SSE connection stays open — when the server recovers (e.g. after a hot-reload or a fix), the next successful render clears the placeholder.

```
// Browser console
[alabjs/live] server render error: Cannot read properties of undefined (reading 'price')
```

---

## Dev Mode

In `alab dev`, the `/_alabjs/live/:id` SSE endpoint is handled by the Vite dev server. Live components hot-reload automatically when their source file changes — the existing SSE connection receives a new HTML fragment within one render cycle.

The dev server also watches for new `*.live.tsx` files. When one is added or removed, `.alabjs/routes.d.ts` is regenerated so the route manifest stays current without a restart.

---

## Limitations

- **Props must be serializable** — functions, DOM nodes, and class instances are stripped.
- **No browser state inside live components** — hooks like `useState` and `useEffect` run on the server; any client-side effects you add are silently ignored.
- **Redis broadcaster is deferred** — in v0.x, live updates are in-process only. Multi-instance deployments need a shared broadcaster (tracked as a future feature; see `broadcaster.ts` for the planned API).
- **Not for forms or interactions** — if the component needs to accept user input, use a regular CSR component with `useMutation`.

---

## API Reference

### `liveInterval`

```ts
export const liveInterval: number; // seconds, minimum 1
```

### `liveTags`

```ts
export const liveTags: string[];
```

### `invalidateLive`

```ts
import { invalidateLive } from "alabjs/server";

await invalidateLive({ tags: string[] }): Promise<void>
```

Triggers an immediate server re-render + push for all live components whose `liveTags` intersect with the provided `tags` array.
