/**
 * Alab offline service worker — queue-and-replay for mutations.
 *
 * This module is compiled to a separate SW entry point by `alab build`.
 * It intercepts failed `/_alab/fn/*` POST requests when the network is
 * unavailable, stores them in IndexedDB, and replays them when connectivity
 * is restored.
 *
 * The SW communicates with the page via `postMessage`:
 *   page  → SW:   { type: "ALAB_REPLAY" }        — manual replay trigger
 *   SW    → page: { type: "ALAB_QUEUED",   count: number }
 *   SW    → page: { type: "ALAB_REPLAYED", fn: string, ok: boolean }
 *   SW    → page: { type: "ALAB_QUEUE_EMPTY" }
 */

// ─── Types shared with the client hook ───────────────────────────────────────

export interface QueuedMutation {
  id: string;
  fn: string;
  body: string;
  timestamp: number;
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

const DB_NAME = "alab-offline";
const STORE = "mutations";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(item: QueuedMutation): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dequeue(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllQueued(): Promise<QueuedMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedMutation[]);
    req.onerror = () => reject(req.error);
  });
}

// ─── Minimal SW global types (avoids lib="WebWorker" conflict with DOM) ──────

interface SwClient { postMessage(msg: unknown): void }
interface SwClients {
  matchAll(opts?: { includeUncontrolled?: boolean }): Promise<SwClient[]>;
  claim(): Promise<void>;
}
interface SwExtendableEvent extends Event { waitUntil(p: Promise<unknown>): void }
interface SwFetchEvent extends SwExtendableEvent {
  request: Request;
  respondWith(r: Promise<Response>): void;
}
interface SwSyncEvent extends SwExtendableEvent { tag: string }
interface SwMessageEvent extends SwExtendableEvent { data: unknown }
interface SwGlobalScope {
  clients: SwClients;
  skipWaiting(): void;
  addEventListener(type: "install", cb: () => void): void;
  addEventListener(type: "activate", cb: (e: SwExtendableEvent) => void): void;
  addEventListener(type: "fetch",   cb: (e: SwFetchEvent) => void): void;
  addEventListener(type: "sync",    cb: (e: SwSyncEvent) => void): void;
  addEventListener(type: "message", cb: (e: SwMessageEvent) => void): void;
}
declare const self: SwGlobalScope;

// ─── Broadcast to all controlled pages ───────────────────────────────────────

function broadcast(msg: Record<string, unknown>) {
  self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
    clients.forEach((c) => c.postMessage(msg));
  });
}

// ─── Replay queued mutations ──────────────────────────────────────────────────

async function replay() {
  const queued = await getAllQueued();
  if (queued.length === 0) {
    broadcast({ type: "ALAB_QUEUE_EMPTY" });
    return;
  }
  for (const item of queued) {
    try {
      const res = await fetch(`/_alab/fn/${item.fn}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: item.body,
      });
      if (res.ok || res.status === 422) {
        // 422 = Zod error — not a network failure; dequeue and notify
        await dequeue(item.id);
        broadcast({ type: "ALAB_REPLAYED", fn: item.fn, ok: res.ok });
      }
      // 5xx: leave in queue and try again next time
    } catch {
      // Still offline — leave in queue
    }
  }
}

// ─── SW event listeners ───────────────────────────────────────────────────────

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event: SwFetchEvent) => {
  const { request } = event;

  // Only intercept mutation POSTs to /_alab/fn/*
  if (
    request.method !== "POST" ||
    !new URL(request.url).pathname.startsWith("/_alab/fn/")
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        return await fetch(request.clone());
      } catch {
        // Network failure — queue the mutation
        const fn = new URL(request.url).pathname.replace("/_alab/fn/", "");
        const body = await request.text();
        const item: QueuedMutation = {
          id: `${fn}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          fn,
          body,
          timestamp: Date.now(),
        };
        await enqueue(item);
        const queued = await getAllQueued();
        broadcast({ type: "ALAB_QUEUED", count: queued.length });

        // Return a synthetic "queued" response so the caller isn't left hanging
        return new Response(JSON.stringify({ __queued: true, id: item.id }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
    })(),
  );
});

self.addEventListener("sync", (event: SwSyncEvent) => {
  if (event.tag === "alab-mutation-replay") {
    event.waitUntil(replay());
  }
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if ((event.data as Record<string, unknown>)?.["type"] === "ALAB_REPLAY") {
    event.waitUntil(replay());
  }
});
