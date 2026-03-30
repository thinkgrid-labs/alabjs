/**
 * GET /stocks/[ticker]/route — returns current quote as JSON.
 * Also demonstrates how to call invalidateLive from a route handler.
 *
 * Example:
 *   curl http://localhost:3000/stocks/AAPL/route
 *
 * To push a market-wide update to all live ticker components:
 *   curl -X POST http://localhost:3000/stocks/AAPL/route
 */

import { invalidateLive } from "alabjs/server";
import { getQuote } from "../../_data.js";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ticker = url.pathname.split("/")[2] ?? "AAPL";
  const quote = getQuote(ticker.toUpperCase());
  return Response.json(quote);
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ticker = url.pathname.split("/")[2] ?? "AAPL";

  // Invalidate all live ticker components subscribed to the "market" tag.
  await invalidateLive({ tags: ["market"] });

  return Response.json({
    ok: true,
    message: `Pushed live update for all "market" subscribers (triggered by ${ticker} POST)`,
  });
}
