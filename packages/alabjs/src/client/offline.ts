/**
 * Alab offline support — client-side registration + queue observation.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { useOfflineMutations } from "alabjs/client";
 *
 * export default function RootLayout({ children }) {
 *   const { isOffline, queuedCount, replay } = useOfflineMutations();
 *
 *   return (
 *     <>
 *       {isOffline && (
 *         <div className="offline-banner">
 *           You're offline — {queuedCount} mutation(s) will sync when reconnected.
 *           <button onClick={replay}>Retry now</button>
 *         </div>
 *       )}
 *       {children}
 *     </>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback } from "react";

export interface OfflineMutationResult {
  replayed: { fn: string; ok: boolean }[];
}

export interface UseOfflineMutationsResult {
  /** True when `navigator.onLine` is false. */
  isOffline: boolean;
  /** Number of mutations currently held in the offline queue. */
  queuedCount: number;
  /** Manually trigger a replay of the offline queue. */
  replay: () => void;
  /** History of replayed mutations since mount (cleared on replay start). */
  replayed: OfflineMutationResult["replayed"];
}

const SW_PATH = "/_alabjs/offline-sw.js";

/**
 * Register the Alab offline service worker and observe queue state.
 *
 * On mount this registers `/_alabjs/offline-sw.js` (emitted by `alab build`).
 * The hook listens for SW messages and browser online/offline events to keep
 * state in sync.
 *
 * Safe to call in SSR — all browser APIs are guarded behind `typeof window`.
 */
export function useOfflineMutations(): UseOfflineMutationsResult {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [queuedCount, setQueuedCount] = useState(0);
  const [replayed, setReplayed] = useState<OfflineMutationResult["replayed"]>([]);

  // Stable SW controller ref
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Register SW
    navigator.serviceWorker.register(SW_PATH, { scope: "/" }).then((reg) => {
      setSwReg(reg);
    }).catch(() => { /* SW blocked (non-HTTPS, private browsing, etc.) */ });

    // Online / offline events
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Messages from the SW
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (!msg) return;
      switch (msg["type"]) {
        case "ALAB_QUEUED":
          setQueuedCount(msg["count"] as number);
          break;
        case "ALAB_REPLAYED":
          setReplayed((prev) => [...prev, { fn: msg["fn"] as string, ok: msg["ok"] as boolean }]);
          break;
        case "ALAB_QUEUE_EMPTY":
          setQueuedCount(0);
          break;
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  const replay = useCallback(() => {
    setReplayed([]);
    if (swReg?.active) {
      swReg.active.postMessage({ type: "ALAB_REPLAY" });
    } else {
      navigator.serviceWorker.controller?.postMessage({ type: "ALAB_REPLAY" });
    }
  }, [swReg]);

  return { isOffline, queuedCount, replay, replayed };
}
