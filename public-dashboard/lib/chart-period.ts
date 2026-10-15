import type { Candle } from "./radar-types";

export function periodCandles(candles: Candle[], period: string): Candle[] {
  if (!candles.length) return [];
  const months = ({ "1M": 1, "3M": 3, "6M": 6, "1Y": 12 } as Record<string, number>)[period] || 3;
  const end = new Date(`${candles.at(-1)!.time}T00:00:00Z`);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(end.getUTCDate(), lastDay));
  const date = start.toISOString().slice(0, 10);
  let index = candles.findIndex((bar) => bar.time >= date);
  if (index < 0) index = candles.length - 1;
  // Use the last available close on/before the calendar boundary for returns.
  if (index > 0 && candles[index].time > date) index--;
  return candles.slice(index);
}
