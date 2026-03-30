/**
 * StockTicker — a "use live" component that polls every 3 seconds.
 *
 * The server re-renders this component and pushes the new HTML fragment
 * over SSE. The client swaps innerHTML — no React reconciliation on updates.
 *
 * Exports:
 *   - default          — the React component (server renders, client stubs)
 *   - liveInterval     — re-render interval in seconds
 *   - liveTags         — tag names for on-demand invalidation via invalidateLive()
 */

import { getQuote } from "./_data.js";

// Re-render every 3 seconds (server-side interval, not client polling).
export const liveInterval = 3;

// Also re-render whenever `invalidateLive({ tags: ["market"] })` is called.
export const liveTags = ["market"];

interface Props {
  ticker: string;
}

export default function StockTicker({ ticker }: Props) {
  const quote = getQuote(ticker);
  const up = quote.change >= 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-xs font-mono uppercase tracking-widest">{quote.ticker}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${up ? "bg-emerald-900/60 text-emerald-400" : "bg-red-900/60 text-red-400"}`}>
          {up ? "▲" : "▼"} {Math.abs(quote.changePct).toFixed(2)}%
        </span>
      </div>
      <span className="text-2xl font-bold tabular-nums">${quote.price.toFixed(2)}</span>
      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
        <span className={up ? "text-emerald-400" : "text-red-400"}>
          {up ? "+" : ""}{quote.change.toFixed(2)}
        </span>
        <span>vol {(quote.volume / 1_000_000).toFixed(2)}M</span>
        <span className="ml-auto text-gray-700 tabular-nums">{new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
