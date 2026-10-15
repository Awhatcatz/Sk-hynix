import { z } from "zod";
import type { Candle } from "./radar-types";

const decimal = z.string().regex(/^\d+(\.\d+)?$/);
export const tossPrice = z.object({ symbol: z.string(), timestamp: z.string().datetime({ offset: true }).nullish().transform((value) => value ?? null), lastPrice: decimal.transform(Number).refine((value) => Number.isFinite(value) && value > 0) });
const candle = z.object({ timestamp: z.string().datetime({ offset: true }), openPrice: decimal, highPrice: decimal, lowPrice: decimal, closePrice: decimal, volume: decimal });
export function parseTossCandles(input: unknown): { candles: Candle[]; nextBefore: string | null } {
  const page = z.object({ candles: candle.array(), nextBefore: z.string().datetime({ offset: true }).nullish().transform((value) => value ?? null) }).parse(input);
  const unique = new Map<string, Candle>();
  for (const item of page.candles) {
    const time = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.timestamp));
    const bar = { time, open: Number(item.openPrice), high: Number(item.highPrice), low: Number(item.lowPrice), close: Number(item.closePrice), volume: Number(item.volume) };
    if (![bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0) || !Number.isFinite(bar.volume) || bar.volume < 0 || bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close)) throw new Error("Invalid Toss candle");
    unique.set(time, bar);
  }
  return { candles: [...unique.values()].sort((a, b) => a.time.localeCompare(b.time)), nextBefore: page.nextBefore };
}
export function priorClose(candles: Candle[], timestamp: string | null) {
  if (!timestamp) return null;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
  return candles.filter((item) => item.time < day).at(-1)?.close ?? null;
}
