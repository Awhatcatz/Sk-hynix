import { SMA, RSI, MACD, ATR, BollingerBands } from "technicalindicators";
import type { Candle, Technical, Asset } from "./radar-types";
import { EMPTY_TECHNICAL } from "./radar-types";

const last = <T>(items: T[]) => items.at(-1);
export function technical(candles: Candle[]): Technical {
  if (candles.length < 35) return { ...EMPTY_TECHNICAL };
  const values = candles.map((bar) => bar.close);
  const ma = Object.fromEntries([5, 20, 60, 120].map((period) => [String(period), last(SMA.calculate({ period, values })) ?? null]));
  const rsi = last(RSI.calculate({ period: 14, values })) ?? null;
  const macd = last(MACD.calculate({ values, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }));
  const atr = last(ATR.calculate({ period: 14, high: candles.map((bar) => bar.high), low: candles.map((bar) => bar.low), close: values })) ?? null;
  const close = last(values)!;
  const factors = [close >= (ma["5"] ?? Infinity), close >= (ma["20"] ?? Infinity), close >= (ma["60"] ?? Infinity),
    rsi !== null && rsi >= 45 && rsi <= 70, (macd?.histogram ?? -Infinity) >= 0];
  const score = factors.filter(Boolean).length * 20;
  const recent = candles.slice(-20);
  const bb = last(BollingerBands.calculate({ period: 20, stdDev: 2, values }));
  return { ma, rsi, macd: macd?.MACD ?? null, histogram: macd?.histogram ?? null, atr, score,
    bollinger: bb ? { upper: bb.upper, middle: bb.middle, lower: bb.lower,
      percentB: bb.upper > bb.lower ? (close - bb.lower) / (bb.upper - bb.lower) * 100 : null,
      bandwidth: bb.middle ? (bb.upper - bb.lower) / bb.middle * 100 : null } : null,
    support: Math.min(...recent.map((bar) => bar.low)), resistance: Math.max(...recent.map((bar) => bar.high)) };
}

export function closedCandles(candles: Candle[], assetId: string, now: Date): Candle[] {
  const zone = ["hynix", "samsung", "kospi"].includes(assetId) ? "Asia/Seoul" : assetId === "bitcoin" ? "UTC" : "America/New_York";
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const cutoff = ["hynix", "samsung", "kospi"].includes(assetId) ? 15 * 60 + 40 : 16 * 60 + 15;
  // Bitcoin and rolling gold futures use yesterday's complete daily bar.
  const includeToday = !["bitcoin", "gold"].includes(assetId) && hour * 60 + minute >= cutoff;
  return candles.filter((bar) => bar.time < date || (bar.time === date && includeToday));
}

export function signalFor(candles: Candle[], stale: boolean): Asset["signal"] {
  const bar = last(candles);
  if (stale || candles.length < 36) return { side: "UNAVAILABLE", reason: stale ? "최신 시세 확인 필요" : "일봉 데이터 부족", barTime: bar?.time ?? null, confirmed: false };
  const current = technical(candles);
  const previous = technical(candles.slice(0, -1));
  const crossUp = previous.ma["5"]! <= previous.ma["20"]! && current.ma["5"]! > current.ma["20"]!;
  const crossDown = previous.ma["5"]! >= previous.ma["20"]! && current.ma["5"]! < current.ma["20"]!;
  if (crossDown) return { side: "SELL", reason: "5일선이 20일선을 하향 돌파 · 확정 일봉", barTime: bar!.time, confirmed: true, cross: "DOWN" };
  if (crossUp && current.rsi! >= 40 && current.rsi! <= 70 && current.histogram! >= 0) return { side: "BUY", reason: "5/20일선 상향 교차 + RSI 40~70 + MACD 개선", barTime: bar!.time, confirmed: true, cross: "UP" };
  return { side: "WAIT", reason: crossUp ? "상향 교차 발생 · RSI/MACD 조건 미충족" : "새로운 5/20일선 교차 없음", barTime: bar!.time, confirmed: true, cross: crossUp ? "UP" : "NONE" };
}
