import type { Quote } from "./radar-types";

// Shared validation is browser-safe; server cache code stays out of the client bundle.
export function parseTicker(data: Record<string, unknown>, now = Date.now()): Quote | null {
  if (data.type !== "ticker" || data.product_id !== "BTC-USD") return null;
  const price = Number(data.price), open = Number(data.open_24h), stamp = Date.parse(String(data.time));
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(stamp) || stamp > now + 300000 || now - stamp > 120000) return null;
  return { id: "bitcoin", price, change: Number.isFinite(open) && open > 0 ? price - open : null,
    changePct: Number.isFinite(open) && open > 0 ? (price / open - 1) * 100 : null, quoteTime: new Date(stamp).toISOString(), stale: false,
    mode: "STREAM", source: "Coinbase Exchange", sourceUrl: "https://www.coinbase.com/price/bitcoin", changeBasis: "ROLLING_24H", delayMinutes: 0 };
}
