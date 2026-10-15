import { XMLParser } from "fast-xml-parser";
import { parse } from "csv-parse/sync";
import { ASSETS, EMPTY_TECHNICAL, type Asset, type Candle, type Macro, type NewsItem } from "./radar-types";
import { closedCandles, signalFor, technical } from "./technical";
import { cryptoDailyBarsComplete, quoteIsStale } from "./market-time";
import { tossAsset, tossConfigured } from "./toss-provider";

async function fetchText(url: string, accept: string) {
  const response = await fetch(url, { headers: { Accept: accept, "User-Agent": "Mozilla/5.0 HynixMarketRadar/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
  return response.text();
}
function dateInZone(timestamp: number, zone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp * 1000));
}
export async function fetchAsset(config: typeof ASSETS[number]): Promise<Asset> {
  let tossError: string | null = null;
  if (tossConfigured() && ["hynix", "samsung", "kospi"].includes(config.id)) {
    try { return await tossAsset(config); } catch (error) { tossError = error instanceof Error ? error.message : "토스 연결 대기"; }
  }
  const sourceUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(config.symbol)}/`;
  const base = { ...config, sourceUrl, source: tossError ? "Yahoo Finance · 토스 연결 실패 대체" : "Yahoo Finance", error: null };
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const text = await fetchText(`https://${host}/v8/finance/chart/${encodeURIComponent(config.symbol)}?range=1y&interval=1d`, "application/json");
      const result = JSON.parse(text).chart?.result?.[0];
      if (!result?.timestamp?.length) throw new Error("No chart data");
      const quote = result.indicators.quote[0], meta = result.meta;
      const zone = config.id === "bitcoin" ? "UTC" : meta.exchangeTimezoneName || "America/New_York";
      const unique = new Map<string, Candle>();
      result.timestamp.forEach((time: number, index: number) => {
        const bar: Candle = { time: dateInZone(time, zone), open: quote.open[index], high: quote.high[index], low: quote.low[index], close: quote.close[index], volume: quote.volume[index] || 0 };
        if ([bar.open, bar.high, bar.low, bar.close].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) unique.set(bar.time, bar);
      });
      const candles = [...unique.values()].sort((a, b) => a.time.localeCompare(b.time));
      if (!candles.length) throw new Error("No valid candles");
      const price = Number(meta.regularMarketPrice) || candles.at(-1)!.close;
      const stamp = Number(meta.regularMarketTime) || result.timestamp.at(-1);
      const stale = quoteIsStale(config.id, stamp);
      const quoteDay = dateInZone(stamp, zone);
      const previous = Number(meta.previousClose) || candles.filter((bar) => bar.time < quoteDay).at(-1)?.close;
      const closed = closedCandles(candles, config.id, new Date());
      const incomplete = config.id === "bitcoin" && !cryptoDailyBarsComplete(closed);
      return { ...base, price, change: previous ? price - previous : null, changePct: previous ? (price / previous - 1) * 100 : null,
        quoteTime: new Date(stamp * 1000).toISOString(), stale, candles, technical: incomplete ? { ...EMPTY_TECHNICAL } : technical(closed),
        signal: incomplete ? { side: "UNAVAILABLE", reason: "완결 일봉 누락 · 기술 신호 중단", barTime: closed.at(-1)?.time ?? null, confirmed: false } : signalFor(closed, stale) };
    } catch { /* Try the provider's alternate chart host. */ }
  }
  return { ...base, price: null, change: null, changePct: null, quoteTime: null, stale: true, candles: [],
    technical: { ...EMPTY_TECHNICAL }, signal: { side: "UNAVAILABLE", reason: "시세 제공처 연결 실패", barTime: null, confirmed: false }, error: "시세 제공처 연결 실패" };
}

const SERIES = [{ id: "DGS10", name: "미국채 10년물" }, { id: "PCEPILFE", name: "코어 PCE" }, { id: "BAMLH0A0HYM2", name: "하이일드 스프레드" }];
export async function fetchMacro(): Promise<Macro[]> {
  return Promise.all(SERIES.map(async (series) => {
    const sourceUrl = `https://fred.stlouisfed.org/series/${series.id}`;
    // ICE's FRED series forbids public redistribution without prior permission.
    if (series.id === "BAMLH0A0HYM2") return { ...series, value: null, change: null, yoy: null, date: null, stale: true, sourceUrl };
    try {
      const csv = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series.id}`, "text/csv");
      const rows = (parse(csv, { columns: true, skip_empty_lines: true }) as Record<string, string>[]).filter((row) => row[series.id] !== "." && Number.isFinite(Number(row[series.id])));
      const latest = rows.at(-1)!, previous = rows.at(-2);
      const date = latest.observation_date || latest.DATE;
      const value = Number(latest[series.id]);
      const yearAgo = `${Number(date.slice(0, 4)) - 1}${date.slice(4, 7)}`;
      const priorYear = rows.find((row) => (row.observation_date || row.DATE).startsWith(yearAgo));
      const age = Date.now() - Date.parse(date);
      return { ...series, value, change: previous ? value - Number(previous[series.id]) : null,
        yoy: series.id === "PCEPILFE" && priorYear ? (value / Number(priorYear[series.id]) - 1) * 100 : null,
        date, stale: age > (series.id === "PCEPILFE" ? 75 : 10) * 86400000, sourceUrl };
    } catch { return { ...series, value: null, change: null, yoy: null, date: null, stale: true, sourceUrl }; }
  }));
}
export async function fetchNews(): Promise<NewsItem[]> {
  try {
    const xml = await fetchText(`https://news.google.com/rss/search?${new URLSearchParams({ q: "SK하이닉스 반도체 when:7d", hl: "ko", gl: "KR", ceid: "KR:ko" })}`, "application/rss+xml");
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const items = parsed.rss?.channel?.item;
    if (!items) return [];
    return Promise.all((Array.isArray(items) ? items : [items]).slice(0, 8).map(async (item) => {
      const url = String(item.link || "");
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url || String(item.title)));
      const id = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("").slice(0, 20);
      return { id: `news-${id}`, title: String(item.title || ""),
        source: typeof item.source === "string" ? item.source : String(item.source?.["#text"] || ""), published: String(item.pubDate || ""), url };
    }));
  } catch { return []; }
}
