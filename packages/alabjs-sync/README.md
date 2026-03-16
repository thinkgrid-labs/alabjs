# alabjs-sync

> Local-first sync engine adapters for [AlabJS](https://github.com/thinkgrid-labs/alabjs) — ElectricSQL, PowerSync, PGlite.

Plug any of three sync backends into your Alab app with a single provider and a pair of hooks. The API is identical across adapters, so you can swap backends without rewriting your components.

| Adapter | Import | Best for |
|---------|--------|----------|
| PGlite | `alabjs-sync/pglite` | Offline-first, SQLite in the browser via WASM — no server required |
| ElectricSQL | `alabjs-sync/electric` | Postgres → client sync via shapes |
| PowerSync | `alabjs-sync/powersync` | Postgres / Supabase → SQLite in the browser |

---

## Installation

```bash
npm install alabjs-sync
```

Then install the peer dependency for your chosen adapter:

```bash
# PGlite
npm install @electric-sql/pglite

# ElectricSQL
npm install @electric-sql/client

# PowerSync
npm install @powersync/web
```

---

## PGlite (zero-server, SQLite via WASM)

```tsx
// app/layout.tsx
import { PGliteProvider } from "alabjs-sync/pglite";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite("idb://myapp"); // persisted in IndexedDB

export default function RootLayout({ children }) {
  return <PGliteProvider db={db}>{children}</PGliteProvider>;
}

// app/todos/page.tsx
import { usePGliteQuery, usePGliteMutation } from "alabjs-sync/pglite";

export default function TodosPage() {
  const { rows } = usePGliteQuery<{ id: number; title: string }>(
    "SELECT * FROM todos ORDER BY id DESC",
  );
  const add = usePGliteMutation("INSERT INTO todos (title) VALUES ($1)");

  return (
    <>
      {rows.map((t) => <li key={t.id}>{t.title}</li>)}
      <button onClick={() => add.mutate(["Buy milk"])}>Add</button>
    </>
  );
}
```

---

## ElectricSQL (Postgres → client shapes)

```tsx
// app/layout.tsx
import { ElectricProvider } from "alabjs-sync/electric";

export default function RootLayout({ children }) {
  return (
    <ElectricProvider url="https://your-electric-server.example.com">
      {children}
    </ElectricProvider>
  );
}

// app/todos/page.tsx
import { useElectricQuery, useElectricMutation } from "alabjs-sync/electric";

export default function TodosPage() {
  const { rows } = useElectricQuery<{ id: string; title: string }>({
    url: "https://your-electric-server.example.com",
    params: { table: "todos" },
  });

  return <ul>{rows.map((t) => <li key={t.id}>{t.title}</li>)}</ul>;
}
```

---

## PowerSync (Postgres / Supabase → SQLite)

```tsx
// app/layout.tsx
import { PowerSyncProvider } from "alabjs-sync/powersync";

export default function RootLayout({ children }) {
  return (
    <PowerSyncProvider
      url="https://your-instance.powersync.journeyapps.com"
      token="<jwt>"
    >
      {children}
    </PowerSyncProvider>
  );
}

// app/todos/page.tsx
import { usePowerSyncQuery, usePowerSyncMutation } from "alabjs-sync/powersync";

export default function TodosPage() {
  const { rows } = usePowerSyncQuery<{ id: string; title: string }>(
    "SELECT * FROM todos ORDER BY id DESC",
  );
  const add = usePowerSyncMutation("INSERT INTO todos (id, title) VALUES (uuid(), ?)");

  return (
    <>
      {rows.map((t) => <li key={t.id}>{t.title}</li>)}
      <button onClick={() => add.mutate(["Buy milk"])}>Add</button>
    </>
  );
}
```

---

## Shared types

All adapters return the same `SyncQueryResult<T>` and `SyncMutationHandle` types, importable from the root entry:

```ts
import type { SyncQueryResult, SyncMutationHandle, SyncStatus } from "alabjs-sync";
```

---

## License

MIT — part of the [AlabJS](https://github.com/thinkgrid-labs/alabjs) monorepo.
