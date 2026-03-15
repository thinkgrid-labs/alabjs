import { AlabProvider } from "alab/client";
import { useSSE } from "alab/client";
import { useSignal, useSignalValue } from "alab/signals";
import { useOfflineMutations } from "alab/client";
import { Sidebar } from "../nav";
import type { ActivityEvent } from "./route";
import type { PageMetadata } from "alab";

export const metadata: PageMetadata = {
  title: "Activity — Alab Dashboard",
  description: "Live activity feed powered by Server-Sent Events.",
  robots: "noindex, nofollow",
  themeColor: "#0f172a",
};

function OfflineBanner() {
  const { isOffline, queuedCount, replay } = useOfflineMutations();
  if (!isOffline && queuedCount === 0) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
      <span>{isOffline ? "⚡ Offline" : "↺ Pending sync"}</span>
      <span className="text-amber-600">{queuedCount} action(s) queued</span>
      {!isOffline && (
        <button
          onClick={replay}
          className="ml-auto text-xs font-semibold text-amber-700 underline hover:no-underline"
        >
          Sync now
        </button>
      )}
    </div>
  );
}

function ActivityFeed() {
  // useSSE — subscribes to the GET /activity SSE stream
  const { data: latest, readyState } = useSSE<ActivityEvent>("/activity", { event: "activity" });

  // useSignal — accumulate events without re-rendering the whole list
  const events = useSignal<ActivityEvent[]>([]);
  const list = useSignalValue(events);

  // Append new events to the signal
  if (latest && (list.length === 0 || list[list.length - 1]?.id !== latest.id)) {
    events.update((prev) => [...prev.slice(-49), latest]);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
        <h2 className="text-sm font-semibold text-zinc-700">Live Activity</h2>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${readyState === "open" ? "text-emerald-600" : "text-zinc-400"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${readyState === "open" ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"}`} />
          {readyState === "open" ? "Live" : readyState === "connecting" ? "Connecting…" : "Disconnected"}
        </span>
      </div>

      {list.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-zinc-400">
          {readyState === "connecting" ? "Connecting to stream…" : "No events yet."}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-50">
          {[...list].reverse().map((evt) => (
            <li key={evt.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-zinc-50 transition-colors">
              <span className="w-6 h-6 flex-shrink-0 rounded-full bg-zinc-100 flex items-center justify-center text-xs text-zinc-500 mt-0.5">
                {evt.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">{evt.user}</span>{" "}
                  {evt.action}
                </p>
              </div>
              <span className="text-xs text-zinc-400 flex-shrink-0 mt-0.5">{evt.ts}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ActivityPage() {
  return (
    <AlabProvider fallback={<div className="flex items-center justify-center h-screen text-zinc-400 text-sm">Loading…</div>}>
      <div className="flex min-h-screen bg-zinc-50">
        <Sidebar />
        <main className="flex-1 p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Activity</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Live feed powered by Server-Sent Events — no WebSocket, no polling.
            </p>
          </div>
          <OfflineBanner />
          <ActivityFeed />
        </main>
      </div>
    </AlabProvider>
  );
}
