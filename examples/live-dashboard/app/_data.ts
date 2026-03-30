/**
 * Simulated market data — no real API needed to run this example.
 *
 * In a real app you'd replace `getQuote` with a call to a financial
 * data provider (e.g. Alpaca, Polygon, Yahoo Finance) and replace
 * `getAlerts` with a database query.
 */

export interface Quote {
  ticker: string;
  price: number;
  change: number;   // absolute change from previous close
  changePct: number; // percentage change
  volume: number;
}

export interface Alert {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  time: string;
}

// Simulate small random price walk around a base price.
const BASE_PRICES: Record<string, number> = {
  AAPL: 182,
  GOOG: 171,
  MSFT: 415,
  TSLA: 248,
};

export function getQuote(ticker: string): Quote {
  const base = BASE_PRICES[ticker] ?? 100;
  // Deterministic noise using current time so each render looks different.
  const seed = (Date.now() / 1000) | 0;
  const noise = ((seed * 1103515245 + 12345) & 0x7fffffff) % 1000 / 1000 - 0.5;
  const price = parseFloat((base + noise * base * 0.02).toFixed(2));
  const change = parseFloat((price - base).toFixed(2));
  const changePct = parseFloat(((change / base) * 100).toFixed(2));
  const volume = Math.floor(1_000_000 + noise * 500_000);
  return { ticker, price, change, changePct, volume };
}

const ALERT_POOL: Alert[] = [
  { id: "a1", level: "info",  message: "Market open — trading has begun.",        time: "09:30" },
  { id: "a2", level: "warn",  message: "TSLA volume spike detected (+340%).",     time: "10:12" },
  { id: "a3", level: "info",  message: "AAPL hits 52-week high.",                 time: "11:45" },
  { id: "a4", level: "error", message: "Circuit breaker triggered on sector ETF.", time: "13:02" },
  { id: "a5", level: "info",  message: "Fed minutes released — indices steady.",  time: "14:00" },
];

export function getAlerts(limit = 3): Alert[] {
  // Rotate the list so each render returns a slightly different set.
  const offset = ((Date.now() / 10_000) | 0) % ALERT_POOL.length;
  return [...ALERT_POOL.slice(offset), ...ALERT_POOL.slice(0, offset)].slice(0, limit);
}
