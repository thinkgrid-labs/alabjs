/**
 * Dashboard home — shows live stock tickers and an alerts feed.
 *
 * The four StockTicker components are "use live": the server pushes fresh HTML
 * every 3 seconds via SSE. AlertsFeed only updates when explicitly invalidated.
 *
 * RouteLink uses the auto-generated AlabRoutes type (.alabjs/routes.d.ts) so
 * any typo in a path becomes a TypeScript error at build time.
 */

import StockTicker from "./stock-ticker.live.js";
import AlertsFeed from "./alerts-feed.live.js";
import { RouteLink } from "alabjs/components";

export const ssr = true;

export const metadata = {
  title: "Live Dashboard — Alab",
  description: 'Real-time stock tickers and alerts powered by alab "use live" components.',
};

const TICKERS = ["AAPL", "GOOG", "MSFT", "TSLA"] as const;

export default function DashboardPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Market Overview</h1>
          <p className="text-gray-500 text-sm mt-1">
            Prices update every 3 s via SSE — no client polling, no WebSockets.
          </p>
        </div>
        {/* RouteLink is type-checked: only valid AlabRoutes paths compile */}
        <RouteLink
          to="/stocks/AAPL"
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          View AAPL detail →
        </RouteLink>
      </div>

      {/* Live stock grid */}
      <section>
        <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-4">Live Prices</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {TICKERS.map((ticker) => (
            <StockTicker key={ticker} ticker={ticker} />
          ))}
        </div>
      </section>

      {/* Alerts feed — tag-invalidated only */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs text-gray-500 uppercase tracking-widest">Alerts</h2>
          <span className="text-xs text-gray-600">
            Invalidate with{" "}
            <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">
              POST /_alabjs/revalidate {"{ tags: [\"alerts\"] }"}
            </code>
          </span>
        </div>
        <AlertsFeed />
      </section>

    </main>
  );
}
