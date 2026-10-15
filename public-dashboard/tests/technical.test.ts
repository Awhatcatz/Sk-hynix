import test from "node:test";
import assert from "node:assert/strict";
import { closedCandles, technical, signalFor } from "../lib/technical";
import { cryptoDailyBarsComplete, quoteIsStale } from "../lib/market-time";
import type { Candle } from "../lib/radar-types";
import { periodCandles } from "../lib/chart-period";
import { parseTicker } from "../lib/coinbase-ticker";
import { researchUpdate } from "../lib/research-validation";
import { RESEARCH_EVIDENCE } from "../lib/research-evidence";
import { applyDomesticRisk } from "../lib/signal-risk";
import { ASSETS, EMPTY_TECHNICAL, type Asset } from "../lib/radar-types";
import { compareEstimates } from "../lib/research-comparison";

const bars = (values: number[]): Candle[] => values.map((close, index) => ({
  time: new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10),
  open: close, high: close + 1, low: close - 1, close, volume: 1000,
}));

test("SMA periods use the matching number of closing prices", () => {
  const stats = technical(bars(Array.from({ length: 120 }, (_, i) => i + 10)));
  assert.equal(stats.ma["5"], 127);
  assert.equal(stats.ma["20"], 119.5);
  assert.equal(stats.ma["60"], 99.5);
  assert.equal(stats.ma["120"], 69.5);
});
test("confirmed down-cross produces SELL", () => {
  const signal = signalFor(bars([...Array(80).fill(100), 90]), false);
  assert.equal(signal.side, "SELL");
  assert.equal(signal.confirmed, true);
});
test("up-cross with moderate RSI and positive MACD produces BUY", () => {
  const signal = signalFor(bars(Array.from({ length: 53 }, (_, i) => 100 + 3 * Math.sin(i / 4))), false);
  assert.equal(signal.side, "BUY");
  assert.equal(signal.confirmed, true);
});
test("overbought up-cross is filtered", () => {
  assert.equal(signalFor(bars([...Array(80).fill(100), 110]), false).side, "WAIT");
});
test("stale quotes never produce an actionable signal", () => {
  const signal = signalFor(bars([...Array(80).fill(100), 90]), true);
  assert.equal(signal.side, "UNAVAILABLE");
  assert.equal(signal.confirmed, false);
});
test("insufficient data produces no signal", () => {
  assert.equal(signalFor(bars(Array(20).fill(100)), false).side, "UNAVAILABLE");
});
const daily: Candle[] = ["2026-10-09", "2026-10-12", "2026-10-13"].map((time) => ({ time, open: 100, high: 101, low: 99, close: 100, volume: 1 }));
test("KRX unfinished day excluded until 15:40 KST", () => {
  assert.equal(closedCandles(daily, "hynix", new Date("2026-10-12T06:39:00Z")).length, 1);
  assert.equal(closedCandles(daily, "hynix", new Date("2026-10-12T06:40:00Z")).length, 2);
});
test("Nasdaq unfinished day excluded until 16:15 New York", () => {
  assert.equal(closedCandles(daily, "nasdaq", new Date("2026-10-12T20:14:00Z")).length, 1);
  assert.equal(closedCandles(daily, "nasdaq", new Date("2026-10-12T20:15:00Z")).length, 2);
});
test("bitcoin and futures only use prior complete dates", () => {
  assert.equal(closedCandles(daily, "bitcoin", new Date("2026-10-12T23:59:00Z")).length, 1);
  assert.equal(closedCandles(daily, "gold", new Date("2026-10-12T23:59:00Z")).length, 1);
});
test("KRX intraday quotes older than 30 minutes are unavailable", () => {
  const now = new Date("2026-10-12T04:00:00Z");
  assert.equal(quoteIsStale("hynix", now.getTime() / 1000 - 1801, now), true);
  assert.equal(quoteIsStale("hynix", now.getTime() / 1000 - 900, now), false);
});
test("weekend exchange close accepted but crypto still requires a fresh quote", () => {
  const now = new Date("2026-10-11T04:00:00Z");
  const friday = Date.parse("2026-10-09T06:30:00Z") / 1000;
  assert.equal(quoteIsStale("hynix", friday, now), false);
  assert.equal(quoteIsStale("bitcoin", friday, now), true);
});
test("future quotes beyond clock tolerance are rejected", () => {
  const now = new Date("2026-10-12T04:00:00Z");
  assert.equal(quoteIsStale("hynix", now.getTime() / 1000 + 301, now), true);
});
test("crypto signal input requires yesterday and 36 consecutive daily bars", () => {
  const now = new Date("2026-10-12T07:00:00Z");
  const complete = Array.from({ length: 36 }, (_, i) => ({ ...daily[0], time: new Date(Date.UTC(2026, 8, 6 + i)).toISOString().slice(0, 10) }));
  assert.equal(cryptoDailyBarsComplete(complete, now), true);
  assert.equal(cryptoDailyBarsComplete(complete.slice(0, -1), now), false);
  assert.equal(cryptoDailyBarsComplete(complete.filter((_, i) => i !== 25), now), false);
  assert.equal(cryptoDailyBarsComplete([...complete.slice(0, -1), { ...complete.at(-1)!, time: "2026-10-12" }], now), false);
});
test("calendar month window clamps March 31 to February 28", () => {
  const candles = Array.from({ length: 59 }, (_, i) => ({ ...daily[0], time: new Date(Date.UTC(2026, 1, 1 + i)).toISOString().slice(0, 10) }));
  const window = periodCandles(candles, "1M");
  assert.equal(window[0].time, "2026-02-28");
  assert.equal(window.at(-1)?.time, "2026-03-31");
});
test("calendar month window handles leap years", () => {
  const candles = Array.from({ length: 60 }, (_, i) => ({ ...daily[0], time: new Date(Date.UTC(2024, 1, 1 + i)).toISOString().slice(0, 10) }));
  assert.equal(periodCandles(candles, "1M")[0].time, "2024-02-29");
});
test("exchange holidays use the nearest prior closing price", () => {
  const candles = ["2026-02-27", "2026-03-02", "2026-03-31"].map((time) => ({ ...daily[0], time }));
  assert.equal(periodCandles(candles, "1M")[0].time, "2026-02-27");
  assert.deepEqual(periodCandles([], "1M"), []);
});
test("Bollinger uses 20 closes, two standard deviations and nullable percentB for flat prices", () => {
  const flat = technical(bars(Array(80).fill(100))).bollinger!;
  assert.equal(flat.upper, 100); assert.equal(flat.lower, 100); assert.equal(flat.percentB, null); assert.equal(flat.bandwidth, 0);
  const bb = technical(bars(Array.from({ length: 80 }, (_, i) => i + 10))).bollinger!;
  assert.equal(bb.middle, 79.5);
  assert.ok(Math.abs(bb.upper - (79.5 + 2 * Math.sqrt(33.25))) < 1e-8);
  assert.ok(Math.abs(bb.lower - (79.5 - 2 * Math.sqrt(33.25))) < 1e-8);
});
test("Samsung uses Korean candle completion and quote age", () => {
  assert.equal(closedCandles(daily, "samsung", new Date("2026-10-12T06:39:00Z")).length, 1);
  assert.equal(closedCandles(daily, "samsung", new Date("2026-10-12T06:40:00Z")).length, 2);
  const now = new Date("2026-10-12T04:00:00Z");
  assert.equal(quoteIsStale("samsung", now.getTime() / 1000 - 1801, now), true);
});
test("stream ticks use rolling 24h baseline and reject invalid or old observations", () => {
  const now = Date.parse("2026-10-12T04:00:00Z");
  const data = { type: "ticker", product_id: "BTC-USD", price: "110", open_24h: "100", time: new Date(now).toISOString() };
  const quote = parseTicker(data, now)!;
  assert.equal(quote.changeBasis, "ROLLING_24H"); assert.ok(Math.abs(quote.changePct! - 10) < 1e-8);
  assert.equal(parseTicker({ ...data, price: "NaN" }, now), null);
  assert.equal(parseTicker({ ...data, time: new Date(now - 120001).toISOString() }, now), null);
  assert.equal(parseTicker({ ...data, product_id: "ETH-USD" }, now), null);
  assert.equal(parseTicker({ ...data, open_24h: "0" }, now)!.changePct, null);
});
test("registered research requires original verification and publication rights", () => {
  const { id, verifiedAt, ...evidence } = RESEARCH_EVIDENCE[0];
  const input = { action: "EVIDENCE", evidence, originalVerified: true, publicationAllowed: true };
  assert.equal(researchUpdate.safeParse(input).success, true);
  assert.equal(researchUpdate.safeParse({ ...input, originalVerified: false }).success, false);
  assert.equal(researchUpdate.safeParse({ ...input, publicationAllowed: false }).success, false);
  assert.equal(researchUpdate.safeParse({ ...input, evidence: { ...evidence, url: "javascript:alert(1)" } }).success, false);
  assert.equal(researchUpdate.safeParse({ ...input, evidence: { ...evidence, published: "2026-02-30" } }).success, false);
});
test("memory data requires authorization, valid units and a positive numeric price", () => {
  const input = { action: "MEMORY", publicationAllowed: true, quotes: [{ product: "TEST ONLY", value: 1, unit: "USD/chip", observedAt: "2026-10-01", sourceUrl: "https://example.com" }] };
  assert.equal(researchUpdate.safeParse(input).success, true);
  assert.equal(researchUpdate.safeParse({ ...input, publicationAllowed: false }).success, false);
  assert.equal(researchUpdate.safeParse({ ...input, quotes: [{ ...input.quotes[0], value: -1 }] }).success, false);
});
test("domestic risk gates both Hynix and Samsung, never changes Nasdaq or sells", () => {
  const asset = (id: Asset["id"]): Asset => ({ ...ASSETS.find((item) => item.id === id)!, price: 100, change: 0, changePct: 0, quoteTime: null, source: "TEST", sourceUrl: "https://example.com", stale: false, error: null, candles: [], technical: { ...EMPTY_TECHNICAL, score: 60 }, signal: { side: "BUY", reason: "TEST", confirmed: true, barTime: "2026-10-01", cross: "UP" } });
  const kospi = asset("kospi");
  for (const id of ["hynix", "samsung"] as const) {
    assert.equal(applyDomesticRisk(asset(id), kospi, undefined).side, "BUY");
    assert.equal(applyDomesticRisk(asset(id), { ...kospi, stale: true }, undefined).side, "WAIT");
    assert.equal(applyDomesticRisk(asset(id), { ...kospi, technical: { ...kospi.technical, score: 20 } }, undefined).side, "WAIT");
    assert.equal(applyDomesticRisk(asset(id), kospi, { id: "HY", name: "HY", value: 5, change: 0, yoy: null, date: "2026-10-01", stale: false, sourceUrl: "https://example.com" }).side, "WAIT");
  }
  assert.equal(applyDomesticRisk(asset("nasdaq"), undefined, undefined).side, "BUY");
  const sell = { ...asset("hynix"), signal: { ...asset("hynix").signal, side: "SELL" as const } };
  assert.equal(applyDomesticRisk(sell, undefined, undefined).side, "SELL");
});
test("estimate comparison only compares latest broker observations of the same period and unit", () => {
  const compared = compareEstimates(RESEARCH_EVIDENCE);
  assert.equal(compared.length, 2); assert.equal(compared[0].count, 2);
  assert.equal(compared[0].period, "2026Q3E"); assert.equal(compared[0].low, 95.451); assert.equal(compared[0].high, 95.8);
  const source = RESEARCH_EVIDENCE.find((item) => item.publisher === "IBK투자증권")!;
  assert.equal(compareEstimates([source, { ...source, published: "2026-09-01", metrics: [{ name: "연결 매출", value: "1", unit: "조원" }] }]).length, 0);
  assert.equal(compareEstimates([source, { ...source, publisher: "OTHER", period: "2026Q4E" }]).length, 0);
});
