import test from "node:test";
import assert from "node:assert/strict";
import type { ResearchEvidence } from "../lib/radar-types";
import { RESEARCH_EVIDENCE } from "../lib/research-evidence";
import {
  ANNUAL_ESTIMATES, ANNUAL_FORECASTS, ANNUAL_SOURCES, BROKER_MEAN_LABEL, arithmeticMean, buildForecastComparison,
  buildValuationScenario, calculateExpectedPrice, getForecastPeriods, getValuationChatContext,
  horizontalPosition, isFinitePositive, isValidAnnualForecast, parseForecastValue, priceDifference, quarterPeriod,
} from "../lib/valuation";

const broker = (changes: Partial<ResearchEvidence> = {}): ResearchEvidence => ({
  id: "broker", publisher: "TEST", title: "TEST", published: "2026-10-07", period: "2026Q3E",
  kind: "BROKER_ESTIMATE", summary: "TEST", verifiedAt: "2026-10-12", url: "https://example.com/report.pdf",
  metrics: [{ name: "연결 매출", value: "100", unit: "조원" }, { name: "연결 영업이익", value: "-2", unit: "조원" }, { name: "목표주가", value: "2,000,000", unit: "원/주 · 유지" }],
  ...changes,
});
const near = (actual: number | null | undefined, expected: number) => assert.ok(actual != null && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("annual original values retain years, units, shareholder basis and page metadata", () => {
  assert.deepEqual(ANNUAL_FORECASTS.map((row) => [row.sourceId, row.year, row.eps, row.bps, row.attributableNetProfit]), [
    ["ibk", 2026, 369678, 540641, 267156], ["ibk", 2027, 479295, 1006176, 350122],
    ["shinhan", 2026, 346550, 520952, 249024.9], ["shinhan", 2027, 434449, 930593, 306904.3],
  ]);
  assert.ok(ANNUAL_FORECASTS.every(isValidAnnualForecast));
  assert.equal(ANNUAL_SOURCES.ibk.published, "2026-10-07");
  assert.equal(ANNUAL_SOURCES.ibk.posted, "2026-10-07 07:18");
  assert.equal(ANNUAL_SOURCES.ibk.page, 4);
  assert.equal(ANNUAL_SOURCES.shinhan.published, "2026-09-30");
  assert.equal(ANNUAL_SOURCES.shinhan.page, 6);
  assert.ok(ANNUAL_SOURCES.shinhan.url.endsWith("20260930_company_263799000.pdf"));
});

test("annual validation rejects quarterly, 12MF and non-positive EPS/BPS bases", () => {
  const annual = ANNUAL_FORECASTS[0];
  assert.equal(isValidAnnualForecast({ ...annual, period: "2026Q3E" }), false);
  assert.equal(isValidAnnualForecast({ ...annual, period: "12MF" }), false);
  for (const value of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(isValidAnnualForecast({ ...annual, eps: value }), false);
    assert.equal(isValidAnnualForecast({ ...annual, bps: value }), false);
  }
});

test("positive finite bases and multiples are mandatory; overflow and underflow fail closed", () => {
  for (const value of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(isFinitePositive(value), false);
    assert.equal(calculateExpectedPrice(value, 10), null);
    assert.equal(calculateExpectedPrice(10, value), null);
  }
  assert.equal(isFinitePositive("10"), false);
  assert.equal(calculateExpectedPrice(Number.MAX_VALUE, 2), null);
  assert.equal(calculateExpectedPrice(Number.MIN_VALUE, 0.1), null);
  assert.equal(calculateExpectedPrice(369678, 9), 3327102);
  assert.equal(calculateExpectedPrice(540641, 1.5), 810961.5);
});

test("PER scenarios use annual EPS for both years and unrounded arithmetic means", () => {
  const first = buildValuationScenario(2026, "PER", 10, 1773000);
  assert.deepEqual(first.rows.map((row) => row.expectedPrice), [3696780, 3465500]);
  assert.equal(first.meanPrice, 3581140);
  near(first.meanDifference?.amount, 1808140);
  near(first.meanDifference?.percent, 1808140 / 1773000 * 100);
  const next = buildValuationScenario(2027, "PER", 9, null);
  assert.deepEqual(next.rows.map((row) => row.expectedPrice), [4313655, 3910041]);
  assert.equal(next.meanPrice, 4111848);
  assert.equal(next.meanDifference, null);
});

test("PBR scenarios use annual BPS, not EPS or forward 12-month BPS", () => {
  const first = buildValuationScenario(2026, "PBR", 2, 1773000);
  assert.deepEqual(first.rows.map((row) => row.expectedPrice), [1081282, 1041904]);
  assert.equal(first.meanPrice, 1061593);
  const next = buildValuationScenario(2027, "PBR", 1.25, null);
  assert.deepEqual(next.rows.map((row) => row.expectedPrice), [1257720, 1163241.25]);
  assert.equal(next.meanPrice, 1210480.625);
  assert.deepEqual(buildValuationScenario(2026, "PBR", 0, null).rows, []);
});

test("a multiple overflowing one broker rejects the whole scenario instead of a partial mean", () => {
  const scenario = buildValuationScenario(2026, "PER", Number.MAX_VALUE / 350000, null);
  assert.equal(scenario.rows.length, 0);
  assert.equal(scenario.meanPrice, null);
});

test("invalid current quotes never become zero-price references or misleading percentages", () => {
  for (const quote of [null, 0, -1, NaN, Infinity]) {
    assert.equal(priceDifference(100, quote), null);
    const scenario = buildValuationScenario(2026, "PER", 1, quote);
    assert.equal(scenario.rows.length, 2);
    assert.ok(scenario.rows.every((row) => row.difference === null));
    assert.equal(scenario.meanDifference, null);
  }
  assert.deepEqual(priceDifference(80, 100), { amount: -20, percent: -20 });
  assert.deepEqual(priceDifference(100, 100), { amount: 0, percent: 0 });
  assert.equal(priceDifference(Number.MAX_VALUE, Number.MIN_VALUE), null);
});

test("arithmetic means include zero and losses without overflow or silent invalid filtering", () => {
  assert.equal(arithmeticMean([]), null);
  assert.equal(arithmeticMean([1, NaN]), null);
  assert.equal(arithmeticMean([Infinity]), null);
  assert.equal(arithmeticMean([-10, 0, 4]), -2);
  assert.equal(arithmeticMean([Number.MAX_VALUE, Number.MAX_VALUE]), Number.MAX_VALUE);
  assert.equal(arithmeticMean([100]), 100);
});

test("chat context exports annual inputs and linked, dated original evidence separately from selection", () => {
  const context = getValuationChatContext({ year: 2027, method: "PBR", multiple: 2, currentPrice: 1000000 });
  assert.equal(context.meanLabel, BROKER_MEAN_LABEL);
  assert.equal(context.forecasts.length, 4);
  assert.equal(context.forecasts, ANNUAL_ESTIMATES);
  assert.equal(ANNUAL_ESTIMATES[0].publisher, "IBK투자증권");
  assert.equal(ANNUAL_ESTIMATES[0].year, 2026);
  assert.equal(ANNUAL_ESTIMATES[0].published, "2026-10-07");
  assert.equal(ANNUAL_ESTIMATES[0].page, 4);
  assert.equal(context.forecasts[0].source.page, 4);
  assert.equal(context.forecasts[2].source.page, 6);
  assert.equal(context.scenario?.meanPrice, 1936769);
  assert.equal(getValuationChatContext().scenario, null);
  assert.match(context.exclusions, /분기 × 4/);
  assert.equal(context.forecasts[0].source.shares.value, 730492);
  assert.match(context.forecasts[0].source.shares.basis, /연간 EPS 분모 아님/);
  assert.doesNotThrow(() => JSON.stringify(context));
});

test("existing broker originals compare quarterly revenue, operating profit and target price", () => {
  const revenue = buildForecastComparison(RESEARCH_EVIDENCE, "revenue", "2026Q3E");
  assert.equal(revenue.count, 2);
  near(revenue.mean, 95.6255);
  assert.deepEqual(revenue.rows.map((row) => row.value), [95.8, 95.451]);
  near(buildForecastComparison(RESEARCH_EVIDENCE, "operatingProfit", "2026Q3E").mean, 74.4685);
  const targets = buildForecastComparison(RESEARCH_EVIDENCE, "targetPrice", "2026Q3E");
  assert.equal(targets.mean, 3350000);
  assert.equal(targets.rows[0].published, "2026-10-07");
  assert.equal(targets.rows[1].published, "2026-09-30");
});

test("different quarter, annual, actual, guidance and industry evidence never enter broker means", () => {
  const evidence = [broker(), broker({ id: "other", publisher: "OTHER", period: "2026Q4E" }),
    broker({ id: "annual", publisher: "ANNUAL", period: "2026F" }),
    broker({ publisher: "ACTUAL", kind: "ACTUAL" }), broker({ publisher: "GUIDANCE", kind: "GUIDANCE" }),
    broker({ publisher: "INDUSTRY", kind: "INDUSTRY_FORECAST" })];
  const result = buildForecastComparison(evidence, "revenue", "2026Q3E");
  assert.equal(result.count, 1);
  assert.equal(result.mean, 100);
  assert.deepEqual(getForecastPeriods(evidence), ["2026Q4E", "2026Q3E"]);
  assert.equal(buildForecastComparison(evidence, "revenue", "2026F").count, 0);
});

test("latest publisher reports are selected before metric parsing; missing new metrics do not revive old reports", () => {
  const old = broker({ id: "old", published: "2026-09-01" });
  const latest = broker({ id: "latest", metrics: [{ name: "연결 매출", value: "120", unit: "조원" }] });
  const evidence = [latest, old, broker({ id: "second", publisher: "OTHER" })];
  assert.equal(buildForecastComparison(evidence, "revenue", "2026Q3E").mean, 110);
  assert.equal(buildForecastComparison(evidence.reverse(), "revenue", "2026Q3E").mean, 110);
  assert.equal(buildForecastComparison([old, { ...latest, metrics: [] }], "revenue", "2026Q3E").count, 0);
  assert.equal(buildForecastComparison([old, { ...latest, metrics: [{ name: "연결 매출", value: "120", unit: "억원" }] }], "revenue", "2026Q3E").count, 0);
  assert.equal(buildForecastComparison([old, { ...latest, publisher: " TEST " }], "revenue", "2026Q3E").count, 1);
});

test("report date validation and source safety reject malformed evidence", () => {
  for (const published of ["2026-02-30", "2026-13-01", "bad", "2026-9-1"]) {
    assert.equal(buildForecastComparison([broker({ published })], "revenue", "2026Q3E").count, 0);
  }
  for (const url of ["javascript:alert(1)", "http://example.com", "https://user:secret@example.com", "invalid"]) {
    assert.equal(buildForecastComparison([broker({ url })], "revenue", "2026Q3E").count, 0);
  }
});

test("same monetary units are required, while target-price revision status is not a unit", () => {
  assert.equal(buildForecastComparison([broker({ metrics: [{ name: "연결 매출", value: "100000", unit: "십억원" }] })], "revenue", "2026Q3E").count, 0);
  for (const unit of ["원/주", "원/주 · 유지", "원/주 · 상향", "원/주 · 하향"]) {
    assert.equal(buildForecastComparison([broker({ metrics: [{ name: "목표주가", value: "2,000,000", unit }] })], "targetPrice", "2026Q3E").mean, 2000000);
  }
  assert.equal(buildForecastComparison([broker({ metrics: [{ name: "목표주가", value: "200", unit: "USD/주" }] })], "targetPrice", "2026Q3E").count, 0);
});

test("strict numeric parsing rejects approximations, ranges, malformed separators and infinities", () => {
  for (const value of ["약 100", "10~15", "1,00", "1,2,3", "Infinity", "NaN", "", "1e3", "100조원", "0x10"]) assert.equal(parseForecastValue(value), null);
  assert.equal(parseForecastValue(" -1,234.5 "), -1234.5);
  assert.equal(parseForecastValue("+95.451"), 95.451);
  assert.equal(buildForecastComparison([broker()], "operatingProfit", "2026Q3E").mean, -2);
  assert.equal(buildForecastComparison([broker({ metrics: [{ name: "연결 영업이익", value: "0", unit: "조원" }] })], "operatingProfit", "2026Q3E").mean, 0);
  assert.equal(buildForecastComparison([broker({ metrics: [{ name: "목표주가", value: "0", unit: "원/주" }] })], "targetPrice", "2026Q3E").count, 0);
});

test("quarter normalization cannot mistake annual or 12MF periods for quarters", () => {
  assert.equal(quarterPeriod("2026Q3F"), "2026Q3E");
  assert.equal(quarterPeriod("2026Q3"), "2026Q3E");
  for (const value of ["2026F", "2026E", "12MF", "2026Q5E", "2026H2"]) assert.equal(quarterPeriod(value), null);
});

test("duplicate metrics fail closed and equal-date report selection is deterministic", () => {
  const a = broker({ id: "a" });
  const z = broker({ id: "z", metrics: [{ name: "연결 매출", value: "200", unit: "조원" }] });
  assert.equal(buildForecastComparison([z, a], "revenue", "2026Q3E").mean, 200);
  assert.equal(buildForecastComparison([a, z], "revenue", "2026Q3E").mean, 200);
  assert.equal(buildForecastComparison([broker({ metrics: [...a.metrics, a.metrics[0]] })], "revenue", "2026Q3E").count, 0);
});

test("horizontal positions preserve zero, losses and very large finite values", () => {
  assert.equal(horizontalPosition(0, -10, 10), 50);
  assert.equal(horizontalPosition(-10, -10, 10), 0);
  assert.equal(horizontalPosition(10, -10, 10), 100);
  assert.equal(horizontalPosition(0, 0, 0), 50);
  assert.equal(horizontalPosition(20, 0, 10), 100);
  assert.equal(horizontalPosition(NaN, 0, 10), null);
  assert.equal(horizontalPosition(5, 10, 0), null);
  assert.equal(horizontalPosition(0, -Number.MAX_VALUE, Number.MAX_VALUE), 50);
});
