/**
 * Alab Analytics — Core Web Vitals collection component.
 *
 * Drop `<Analytics />` into your root layout to start collecting
 * LCP, CLS, INP, TTFB, and FCP from real users. Metrics are sent
 * to `/_alabjs/vitals` via `navigator.sendBeacon` and aggregated
 * in memory on the server.
 *
 * ## Usage
 *
 * ```tsx
 * // app/layout.tsx
 * import { Analytics } from "alabjs/components";
 *
 * export default function RootLayout({ children }: { children: React.ReactNode }) {
 *   return (
 *     <>
 *       {children}
 *       <Analytics />
 *     </>
 *   );
 * }
 * ```
 *
 * ## Viewing metrics
 *
 * ```sh
 * curl -H "Authorization: Bearer $ALAB_ANALYTICS_SECRET" \
 *      http://localhost:3000/_alabjs/analytics
 * ```
 */

import { useEffect } from "react";

export interface AnalyticsProps {
  /**
   * Override the beacon endpoint.
   * @default "/_alabjs/vitals"
   */
  endpoint?: string;
}

/**
 * Collects Core Web Vitals (LCP, CLS, INP, TTFB, FCP) using the browser's
 * `PerformanceObserver` API and sends them to the AlabJS vitals endpoint.
 *
 * Uses `navigator.sendBeacon` so beacons are fire-and-forget and survive
 * page unloads. Implements `buffered: true` so metrics already emitted
 * before the observer attached are still captured.
 */
export function Analytics({ endpoint = "/_alabjs/vitals" }: AnalyticsProps) {
  useEffect(() => {
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;

    const route = window.location.pathname;

    function send(name: string, value: number) {
      const payload = JSON.stringify({ name, value, route });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
      } else {
        // Fallback for environments without sendBeacon (rare).
        void fetch(endpoint, {
          method: "POST",
          body: payload,
          headers: { "content-type": "application/json" },
          keepalive: true,
        }).catch(() => {});
      }
    }

    const observers: PerformanceObserver[] = [];

    function observe(type: string, cb: (entries: PerformanceObserverEntryList) => void) {
      try {
        const po = new PerformanceObserver(cb);
        po.observe({ type, buffered: true });
        observers.push(po);
      } catch {
        // Entry type not supported in this browser — skip silently.
      }
    }

    // ── LCP — Largest Contentful Paint ─────────────────────────────────────
    // We report the last entry since LCP can be updated multiple times.
    let lcpValue = 0;
    observe("largest-contentful-paint", (list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as PerformancePaintTiming | undefined;
      if (last) lcpValue = last.startTime;
    });

    // ── CLS — Cumulative Layout Shift ───────────────────────────────────────
    // Accumulate shift values across all layout-shift entries.
    let clsValue = 0;
    let clsSessionGap = 0;
    let clsSessionValue = 0;
    let clsLastTime = 0;
    observe("layout-shift", (list) => {
      for (const entry of list.getEntries()) {
        const ls = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (ls.hadRecentInput) continue;
        const gap = ls.startTime - clsLastTime;
        if (gap > 1000 || ls.startTime - clsSessionGap > 5000) {
          clsSessionValue = ls.value;
          clsSessionGap = ls.startTime;
        } else {
          clsSessionValue += ls.value;
        }
        clsLastTime = ls.startTime;
        if (clsSessionValue > clsValue) clsValue = clsSessionValue;
      }
    });

    // ── INP — Interaction to Next Paint ────────────────────────────────────
    // Track the worst interaction duration (p98 heuristic: worst of all events).
    let inpValue = 0;
    observe("event", (list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEntry & { duration: number };
        if (e.duration > inpValue) inpValue = e.duration;
      }
    });

    // ── TTFB — Time to First Byte ───────────────────────────────────────────
    // Read directly from navigation timing — available immediately after load.
    const sendTtfb = () => {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      if (nav) send("TTFB", nav.responseStart);
    };

    // ── FCP — First Contentful Paint ───────────────────────────────────────
    observe("paint", (list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          send("FCP", entry.startTime);
        }
      }
    });

    // Flush LCP, CLS, and INP on page hide (navigating away / tab close).
    // This gives us the most accurate final values.
    const flush = () => {
      if (lcpValue > 0) send("LCP", lcpValue);
      if (clsValue > 0) send("CLS", Math.round(clsValue * 10000) / 10000);
      if (inpValue > 0) send("INP", inpValue);
    };

    sendTtfb();
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    }, { once: true });

    return () => {
      for (const po of observers) po.disconnect();
    };
  // endpoint is intentionally captured once on mount only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
