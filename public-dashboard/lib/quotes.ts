import { ASSETS, type Quote, type Quotes } from "./radar-types";
import { quoteIsStale } from "./market-time";
import { acquireLock, readCache, releaseLock, writeCache } from "./radar-store";
import { parseTicker } from "./coinbase-ticker";
import { tossConfigured, tossQuotes, tossSetupStatus } from "./toss-provider";

async function json(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "HynixMarketRadar/1.1" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Quote source unavailable");
  return response.json() as Promise<any>;
}
async function fetchQuote(config: typeof ASSETS[number]): Promise<Quote> {
  if (config.id === "bitcoin") {
    try {
      const [ticker, stats] = await Promise.all([json("https://api.exchange.coinbase.com/products/BTC-USD/ticker"), json("https://api.exchange.coinbase.com/products/BTC-USD/stats")]);
      const quote = parseTicker({ ...ticker, type: "ticker", product_id: "BTC-USD", open_24h: stats.open });
      if (quote) return { ...quote, mode: "POLL" };
    } catch { /* Yahoo remains an explicitly attributed fallback. */ }
  }
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const data = await json(`https://${host}/v8/finance/chart/${encodeURIComponent(config.symbol)}?range=1d&interval=1d`);
      const meta = data.chart?.result?.[0]?.meta;
      const price = Number(meta?.regularMarketPrice), stamp = Number(meta?.regularMarketTime), previous = Number(meta?.previousClose ?? meta?.chartPreviousClose);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(stamp) || stamp <= 0) throw new Error("Invalid quote");
      return { id: config.id, price, change: previous > 0 ? price - previous : null, changePct: previous > 0 ? (price / previous - 1) * 100 : null,
        quoteTime: new Date(stamp * 1000).toISOString(), stale: quoteIsStale(config.id, stamp), source: "Yahoo Finance",
        sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(config.symbol)}/`, mode: "POLL", changeBasis: "PREVIOUS_CLOSE",
        delayMinutes: typeof meta.exchangeDataDelayedBy === "number" ? meta.exchangeDataDelayedBy : null };
    } catch { /* Try the alternate public feed host. */ }
  }
  return { id: config.id, price: null, change: null, changePct: null, quoteTime: null, stale: true, source: "Yahoo Finance",
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(config.symbol)}/`, mode: "POLL", changeBasis: "PREVIOUS_CLOSE", delayMinutes: null };
}
export async function getQuotes(): Promise<Quotes> {
  const saved = await readCache<Quotes>("quotes:v1");
  if (saved && Date.now() - saved.updatedAt < (tossConfigured() ? 10000 : 30000)) return saved.value;
  if (!await acquireLock("quote-refresh", 45000)) {
    if (saved) return { ...saved.value, quotes: saved.value.quotes.map((quote) => ({ ...quote, stale: !quote.quoteTime || quoteIsStale(quote.id, Date.parse(quote.quoteTime) / 1000) })) };
    throw new Error("Quote refresh in progress");
  }
  try {
    let domestic: Quote[] = [], providerStatus = tossSetupStatus();
    if (tossConfigured()) {
      try { domestic = await tossQuotes(); await writeCache("toss-last-quotes", domestic); providerStatus = "토스 최근 체결가 · 10초 조회 · 주문 API 미사용"; }
      catch (error) { providerStatus = (error instanceof Error ? error.message : "토스 연결 대기") + " · 일반 시세로 대체"; }
    }
    const quotes = await Promise.all(ASSETS.map((config) => domestic.find((item) => item.id === config.id) || fetchQuote(config)));
    const result: Quotes = { generatedAt: new Date().toISOString(), providerStatus, quotes: quotes.map((quote) => {
      const prior = saved?.value.quotes.find((item) => item.id === quote.id);
      return quote.price === null && prior ? { ...prior, stale: true } : quote;
    }) };
    await writeCache("quotes:v1", result);
    return result;
  } finally { await releaseLock("quote-refresh"); }
}
