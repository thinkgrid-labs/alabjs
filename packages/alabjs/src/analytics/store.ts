/**
 * In-memory analytics store.
 *
 * Keeps a ring buffer of the last RING_SIZE samples for each
 * (route, metric) pair and exposes p75 aggregates.
 *
 * All writes are synchronous and happen in the same Node.js event-loop
 * turn as the beacon POST — no blocking, no external I/O.
 */

/** Maximum samples retained per (route, metric) bucket. */
const RING_SIZE = 500;

export type MetricName = "LCP" | "CLS" | "INP" | "TTFB" | "FCP";

const METRIC_NAMES: MetricName[] = ["LCP", "CLS", "INP", "TTFB", "FCP"];

interface RouteBucket {
  /** Ring buffers — one per metric. */
  samples: Record<MetricName, number[]>;
  /** Number of LCP events received (proxy for page-view count). */
  pageviews: number;
}

/** route path → bucket */
const store = new Map<string, RouteBucket>();

function getBucket(route: string): RouteBucket {
  let bucket = store.get(route);
  if (!bucket) {
    const samples = {} as Record<MetricName, number[]>;
    for (const m of METRIC_NAMES) samples[m] = [];
    bucket = { samples, pageviews: 0 };
    store.set(route, bucket);
  }
  return bucket;
}

/**
 * Record one metric sample for a route.
 * If the ring buffer is full, the oldest sample is evicted.
 */
export function recordMetric(route: string, name: MetricName, value: number): void {
  if (!METRIC_NAMES.includes(name)) return;
  const bucket = getBucket(route);
  const buf = bucket.samples[name];
  buf.push(value);
  if (buf.length > RING_SIZE) buf.shift();
  if (name === "LCP") bucket.pageviews++;
}

/** Compute the p75 of an array of numbers, or null if empty. */
function p75(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.75);
  return Math.round((sorted[idx] ?? sorted[sorted.length - 1]!) * 100) / 100;
}

export interface RouteStats {
  pageviews: number;
  lcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
  ttfb_p75: number | null;
  fcp_p75: number | null;
}

export interface AnalyticsSnapshot {
  routes: Record<string, RouteStats>;
  /** ISO timestamp of when the snapshot was taken. */
  asOf: string;
}

/** Return an aggregated snapshot of all collected metrics. */
export function getSnapshot(): AnalyticsSnapshot {
  const routes: Record<string, RouteStats> = {};
  for (const [route, bucket] of store.entries()) {
    routes[route] = {
      pageviews:  bucket.pageviews,
      lcp_p75:   p75(bucket.samples.LCP),
      cls_p75:   p75(bucket.samples.CLS),
      inp_p75:   p75(bucket.samples.INP),
      ttfb_p75:  p75(bucket.samples.TTFB),
      fcp_p75:   p75(bucket.samples.FCP),
    };
  }
  return { routes, asOf: new Date().toISOString() };
}

/** Clear all stored data (useful in tests). */
export function clearStore(): void {
  store.clear();
}
