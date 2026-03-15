---
title: Offline & Sync
description: Queue mutations when offline and replay them when connectivity returns.
---

AlabJS includes an offline-first layer that intercepts failed server function calls, stores them in IndexedDB, and replays them when the network returns. No configuration required.

## How it works

When `alabjs build` runs, it compiles a service worker to `.alabjs/dist/client/_alabjs/offline-sw.js` and serves it at `/_alabjs/offline-sw.js`.

The service worker intercepts all `POST /_alabjs/fn/*` requests (server function calls). When the network is unavailable, instead of letting the request fail, it:

1. Stores the request body in IndexedDB
2. Returns a synthetic `202 Accepted` response with `{ __queued: true, id }`
3. Broadcasts a `ALAB_QUEUED` message to all open tabs
4. Replays the queue when connectivity is restored (via Background Sync or manual trigger)

## Reading offline state in a component

```tsx
import { useOfflineMutations } from "alabjs/client";

export default function StatusBar() {
  const { isOffline, queuedCount, replay, replayed } = useOfflineMutations();

  if (!isOffline && queuedCount === 0) return null;

  return (
    <div className="offline-bar">
      {isOffline ? (
        <span>You are offline. {queuedCount} action(s) queued.</span>
      ) : (
        <span>{queuedCount} action(s) pending sync.</span>
      )}
      <button onClick={replay}>Sync now</button>
      {replayed.map((r) => (
        <p key={r.id}>
          {r.fn}: {r.ok ? "synced" : "failed"}
        </p>
      ))}
    </div>
  );
}
```

## Handling the queued response

When a mutation is queued, the server function call still "succeeds" from the caller's perspective — it just gets `{ __queued: true }` back instead of real data. You can check for this in your mutation handler:

```tsx
import { useMutation } from "alabjs/client";
import { createPost } from "./page.server";

export function CreatePostButton() {
  const { mutate, data, isPending } = useMutation(createPost);

  const handleClick = async () => {
    const result = await mutate({ title: "Draft" });
    if (result.__queued) {
      // Show "saved offline" UI
    }
  };

  return <button onClick={handleClick} disabled={isPending}>Create</button>;
}
```

## Automatic replay

The service worker registers a Background Sync tag (`alabjs-mutation-replay`) when it queues a mutation. The browser automatically triggers replay when the connection is restored — even if the tab is closed.

:::note
Background Sync is currently supported in Chrome and Edge. In Firefox and Safari, AlabJS falls back to replaying when the `online` event fires while the tab is open.
:::

## Manual replay

Call `replay()` from `useOfflineMutations` to trigger an immediate replay attempt:

```tsx
const { replay } = useOfflineMutations();

<button onClick={replay}>Retry queued actions</button>
```

## Replay behaviour

| Server response | Action |
|---|---|
| `2xx` | Dequeued — mutation succeeded |
| `422` (validation error) | Dequeued — not a network failure |
| `5xx` | Kept in queue — retried next replay |
| Network error | Kept in queue — still offline |

## Disabling offline support

The offline service worker is registered automatically in production builds. To opt out, set:

```ts
// alabjs.config.ts
export default {
  offline: false,
};
```

## Local-first sync with `@alabjs/sync`

For more advanced offline-first patterns — conflict resolution, real-time collaborative editing, local SQL — use the `@alabjs/sync` package:

```bash
pnpm add @alabjs/sync
```

`@alabjs/sync` provides duck-typed React adapters for:

- **PGlite** — SQLite in the browser (WASM) with live queries
- **ElectricSQL** — Postgres-to-browser sync via shapes
- **PowerSync** — Offline-first sync for any backend

### PGlite

```tsx
import { PGliteProvider, usePGliteQuery } from "@alabjs/sync/pglite";
import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";

const db = await PGlite.create({ extensions: { live } });

function App() {
  return (
    <PGliteProvider db={db}>
      <PostList />
    </PGliteProvider>
  );
}

function PostList() {
  const { rows, loading } = usePGliteQuery("SELECT * FROM posts ORDER BY created_at DESC");
  if (loading) return <p>Loading...</p>;
  return <ul>{rows.map((r) => <li key={r.id}>{r.title}</li>)}</ul>;
}
```

### ElectricSQL

```tsx
import { ElectricProvider, useShape } from "@alabjs/sync/electric";

function App() {
  return (
    <ElectricProvider url="https://your-electric-instance.example.com">
      <PostList />
    </ElectricProvider>
  );
}

function PostList() {
  const { data } = useShape({ url: "/v1/shape/posts" });
  return <ul>{data.map((r) => <li key={r.id}>{r.title}</li>)}</ul>;
}
```

### PowerSync

```tsx
import { PowerSyncProvider, usePowerSyncQuery } from "@alabjs/sync/powersync";

function App() {
  return (
    <PowerSyncProvider db={db}>
      <PostList />
    </PowerSyncProvider>
  );
}

function PostList() {
  const { data } = usePowerSyncQuery("SELECT * FROM posts");
  return <ul>{data.map((r) => <li key={r.id}>{r.title}</li>)}</ul>;
}
```

## API Reference

### `useOfflineMutations(): UseOfflineMutationsResult`

```ts
interface UseOfflineMutationsResult {
  /** True when the browser reports no network connection. */
  isOffline: boolean;
  /** Number of mutations waiting to be replayed. */
  queuedCount: number;
  /** Trigger an immediate replay attempt. */
  replay: () => void;
  /** Mutations that have been replayed since mount. */
  replayed: OfflineMutationResult[];
}

interface OfflineMutationResult {
  id: string;
  fn: string;
  ok: boolean;
}
```
