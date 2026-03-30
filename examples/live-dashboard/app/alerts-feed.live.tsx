/**
 * AlertsFeed — a "use live" component that only updates on tag invalidation.
 *
 * No interval — this component stays static until something calls:
 *   invalidateLive({ tags: ["alerts"] })
 *
 * To trigger an update, POST to the revalidate endpoint:
 *   curl -X POST http://localhost:3000/_alabjs/revalidate \
 *        -H "Authorization: Bearer dev" \
 *        -H "Content-Type: application/json" \
 *        -d '{"tags":["alerts"]}'
 */

import { getAlerts } from "./_data.js";

// No interval — only refreshes when explicitly invalidated.
export const liveTags = ["alerts"];

const LEVEL_STYLES = {
  info:  "bg-blue-900/40 text-blue-300 border-blue-800/60",
  warn:  "bg-amber-900/40 text-amber-300 border-amber-800/60",
  error: "bg-red-900/40 text-red-300 border-red-800/60",
};

const LEVEL_DOT = {
  info:  "bg-blue-400",
  warn:  "bg-amber-400",
  error: "bg-red-400",
};

export default function AlertsFeed() {
  const alerts = getAlerts(3);

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-start gap-3 border rounded-lg px-4 py-3 text-sm ${LEVEL_STYLES[alert.level]}`}
        >
          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT[alert.level]}`} />
          <span className="flex-1">{alert.message}</span>
          <span className="text-xs opacity-50 tabular-nums shrink-0">{alert.time}</span>
        </div>
      ))}
    </div>
  );
}
