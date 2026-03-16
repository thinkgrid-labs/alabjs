/**
 * H3 route handlers for the AlabJS analytics endpoints.
 *
 * POST /_alabjs/vitals  — receives Core Web Vitals beacons from the browser.
 * GET  /_alabjs/analytics — returns aggregated per-route stats (requires auth).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { recordMetric, getSnapshot, type MetricName } from "./store.js";

const METRIC_NAMES = new Set<string>(["LCP", "CLS", "INP", "TTFB", "FCP"]);

/** Read the raw request body as a UTF-8 string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * POST /_alabjs/vitals
 *
 * Accepts a JSON beacon: { name, value, route }
 * Called by the browser via navigator.sendBeacon — no auth required.
 * Always responds 204 so the browser doesn't wait.
 */
export async function handleVitalsBeacon(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  res.setHeader("access-control-allow-origin", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }

  try {
    const raw = await readBody(req);
    // sendBeacon may batch multiple events as a JSON array or single object.
    const parsed: unknown = JSON.parse(raw);
    const events = Array.isArray(parsed) ? parsed : [parsed];

    for (const ev of events) {
      if (
        ev !== null &&
        typeof ev === "object" &&
        "name" in ev && typeof ev.name === "string" &&
        "value" in ev && typeof ev.value === "number" &&
        "route" in ev && typeof ev.route === "string" &&
        METRIC_NAMES.has(ev.name)
      ) {
        recordMetric(
          ev.route.slice(0, 256),        // cap length for safety
          ev.name as MetricName,
          ev.value,
        );
      }
    }
  } catch {
    // Malformed beacon — swallow silently, still return 204.
  }

  res.statusCode = 204;
  res.end();
}

/**
 * GET /_alabjs/analytics
 *
 * Returns a JSON snapshot of all collected metrics.
 * Protected by Authorization: Bearer <ALAB_ANALYTICS_SECRET>.
 * Falls back to ALAB_REVALIDATE_SECRET if ALAB_ANALYTICS_SECRET is unset.
 */
export function handleAnalyticsDashboard(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const secret =
    process.env["ALAB_ANALYTICS_SECRET"] ??
    process.env["ALAB_REVALIDATE_SECRET"];

  if (secret) {
    const auth = req.headers["authorization"] ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== secret) {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized. Set Authorization: Bearer <ALAB_ANALYTICS_SECRET>." }));
      return;
    }
  }

  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(getSnapshot(), null, 2));
}
