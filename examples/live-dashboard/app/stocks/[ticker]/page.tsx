/**
 * Stock detail page — /stocks/[ticker]
 *
 * Shows a single ticker with a larger live component plus a
 * back link. Demonstrates typed navigate() and nested dynamic routes.
 */

import StockTicker from "../../stock-ticker.live.js";
import { RouteLink } from "alabjs/components";

export const ssr = true;

export function generateMetadata({ params }: { params: Record<string, string> }) {
  return {
    title: `${params["ticker"] ?? "Stock"} — Live Dashboard`,
  };
}

export default function StockDetailPage({
  params,
}: {
  params: Record<string, string>;
  searchParams: Record<string, string>;
}) {
  const ticker = params["ticker"] ?? "AAPL";

  return (
    <main className="max-w-lg mx-auto px-6 py-10 space-y-6">
      <RouteLink
        to="/"
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        ← Back to dashboard
      </RouteLink>

      <div>
        <h1 className="text-2xl font-bold">{ticker}</h1>
        <p className="text-gray-500 text-sm mt-1">Live price — updates every 3 s</p>
      </div>

      <StockTicker ticker={ticker} />

      <p className="text-xs text-gray-600 pt-4 border-t border-gray-800">
        This component is rendered on the server and pushed as an HTML fragment
        over SSE — no JSON API, no client state, no hydration on updates.
      </p>
    </main>
  );
}
