import test from "node:test";
import assert from "node:assert/strict";
import { ANALYSTS, masterReportSchema, reportSchema, publicRun, type AnalystReport, type StoredCouncilRun } from "../lib/council-contract";
import { ASSETS, type Quote } from "../lib/radar-types";
import { tradeCandidates, resolveTradePlan, effectiveTradePlan, formatPriceCondition, buyScenario, type TradeDecision } from "../lib/trade-plan";
import { entryDistance, priceConditionTouched, positionSimulation } from "../lib/investor-tools";
import { councilPrompt } from "../lib/council-prompts";
import { zodSchema } from "ai";

const now = Date.parse("2026-10-13T03:30:00Z");
const report: AnalystReport = { stance: "NEUTRAL", headline: "Observation", summary: "Evidence", findings: [{ sourceId: "daily", observation: "Daily data" }], upsideCondition: "Recovery", downsideCondition: "Support loss", caution: "Risk", lesson: "Average", agreements: [], disagreements: [], watchpoints: [] };
function fixture(assetId: StoredCouncilRun["assetId"] = "hynix"): StoredCouncilRun {
  const asset = { ...ASSETS.find((a) => a.id === assetId)!, price: 1700000, quoteTime: new Date(now - 30000).toISOString(), change: 0, changePct: 0, source: "Fixture", sourceUrl: "https://example.com", stale: false, error: null,
    technical: { ma: { "5": 1680000, "20": 1650000, "60": 1500000, "120": 1400000 }, atr: 30000, rsi: 55, macd: 100, histogram: 20, score: 0, support: 1600000, resistance: 1800000, bollinger: { upper: 1750000, middle: 1650000, lower: 1550000, percentB: .75, bandwidth: 10 } },
    signal: { side: "WAIT" as const, reason: "Fixture", barTime: "2026-10-12", confirmed: false } };
  return { id: "test", assetId, assetName: asset.name, createdBy: "private", createdAt: new Date(now - 60000).toISOString(), updatedAt: new Date(now).toISOString(), status: "complete", marketAsOf: new Date(now - 60000).toISOString(), quoteAsOf: new Date(now - 30000).toISOString(), dailyBarTime: "2026-10-12", stale: false, warnings: [], sources: [{ id: "daily", title: "Fixture", url: "https://example.com", date: "2026-10-12" }],
    analysts: ANALYSTS.map((a) => ({ id: a.id, model: a.model, status: "done", report: structuredClone(report), attempts: 1, startedAt: null, completedAt: null, error: null, tokens: null })),
    context: { asset, quote: null, closedBars: [], dailyTechnical: asset.technical, previousTechnical: asset.technical, dailyBarTime: "2026-10-12", marketAsOf: new Date(now - 60000).toISOString(), quoteAsOf: new Date(now - 30000).toISOString(), macro: [], news: [], evidence: [], annualEstimates: null, memory: [], memoryStatus: "None", warnings: [] } };
}
const decision = (action: TradeDecision["action"], candidateId: string | null): TradeDecision => ({ action, candidateId, reason: "Observed support with confirmation, not a guaranteed return" });

test("master requires a strict decision while old specialist reports remain readable", () => {
  assert.equal(reportSchema.safeParse(report).success, true);
  assert.equal(masterReportSchema.safeParse(report).success, false);
  assert.equal(masterReportSchema.safeParse({ ...report, tradeDecision: { ...decision("BUY", "buy-support"), watchCandidateId: null } }).success, true);
  assert.equal(masterReportSchema.safeParse({ ...report, tradeDecision: { ...decision("BUY", "buy-support"), inventedPrice: 123 } }).success, false);
});
test("master generation JSON schema requires all properties, including nullable watch selection", async () => {
  const schema = await zodSchema(masterReportSchema).jsonSchema;
  function inspect(value: unknown) {
    if (!value || typeof value !== "object") return;
    const node = value as { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
    if (node.properties) { assert.deepEqual([...(node.required || [])].sort(), Object.keys(node.properties).sort()); assert.equal(node.additionalProperties, false); }
    for (const item of Object.values(value)) inspect(item);
  }
  inspect(schema);
  assert.equal(masterReportSchema.safeParse({ ...report, tradeDecision: decision("HOLD", null) }).success, false, "Generation must explicitly select an ID or null");
});
test("price candidates are derived from captured indicators, correctly ordered and positive", () => {
  const candidates = tradeCandidates(fixture(), now);
  const support = candidates.find((c) => c.id === "buy-support")!;
  assert.equal(support.trigger.price, 1600000); assert.equal(support.invalidation.price, 1555000);
  assert.equal(support.target!.price, 1750000); assert.equal(support.riskReward, 3.33);
  for (const c of candidates.filter((c) => c.action === "BUY")) { assert.ok(c.invalidation.price > 0 && c.invalidation.price < c.trigger.price && c.trigger.price < c.target!.price); assert.ok(c.riskReward! >= 1.5); }
});
test("AI selects validated BUY or SELL scenarios and cannot invent a threshold or mix actions", () => {
  const run = fixture();
  const buy = resolveTradePlan(run, decision("BUY", "buy-support"), now); assert.equal(buy.action, "BUY"); assert.equal(buy.candidate!.trigger.price, 1600000);
  const sell = resolveTradePlan(run, decision("SELL", "sell-support"), now); assert.equal(sell.action, "SELL"); assert.equal(sell.candidate!.target, null); assert.equal(sell.candidate!.trigger.comparator, "CLOSE_BELOW");
  assert.equal(resolveTradePlan(run, decision("BUY", "buy-123456"), now).action, "HOLD");
  assert.equal(resolveTradePlan(run, decision("BUY", "sell-support"), now).action, "HOLD");
  assert.equal(resolveTradePlan(run, decision("HOLD", null), now).candidate, null);
  assert.equal(resolveTradePlan(run, undefined, now).action, "HOLD");
});
test("stale, missing, future or old quotes/data never produce actionable price conditions", () => {
  for (const mutate of [
    (r: StoredCouncilRun) => { r.stale = true; },
    (r: StoredCouncilRun) => { r.context.asset.stale = true; },
    (r: StoredCouncilRun) => { r.context.asset.quoteTime = null; },
    (r: StoredCouncilRun) => { r.context.asset.price = NaN; },
    (r: StoredCouncilRun) => { r.context.asset.quoteTime = new Date(now + 10 * 60000).toISOString(); },
    (r: StoredCouncilRun) => { r.marketAsOf = new Date(now - 16 * 60000).toISOString(); },
    (r: StoredCouncilRun) => { r.dailyBarTime = "2026-09-01"; },
    (r: StoredCouncilRun) => { r.dailyBarTime = "2026-10-14"; },
  ]) { const run = fixture(); mutate(run); assert.deepEqual(tradeCandidates(run, now), []); assert.equal(resolveTradePlan(run, decision("BUY", "buy-support"), now).action, "HOLD"); }
});
test("partial failures and any insufficient expert/master suppress concrete AI actions", () => {
  const run = fixture(); run.analysts[3].status = "error"; run.analysts[3].report = null;
  assert.equal(resolveTradePlan(run, decision("SELL", "sell-support"), now).action, "HOLD");
  run.analysts[3].status = "done"; run.analysts[3].report = { ...report, stance: "INSUFFICIENT" };
  assert.equal(resolveTradePlan(run, decision("BUY", "buy-support"), now).action, "HOLD");
  run.analysts[3].report = report; run.analysts[4].report = { ...report, stance: "INSUFFICIENT" };
  assert.equal(resolveTradePlan(run, decision("BUY", "buy-support"), now).action, "HOLD");
});
test("ATR gaps, invalid numbers, and poor reward/risk never create a BUY", () => {
  for (const atr of [null, NaN, Infinity, 0, -1, 500000]) { const run = fixture(); run.context.dailyTechnical.atr = atr; assert.equal(tradeCandidates(run, now).length, 0); }
  const run = fixture(); run.context.dailyTechnical.atr = 170000;
  assert.equal(tradeCandidates(run, now).filter((c) => c.action === "BUY").length, 0);
});
test("overflow and missing momentum inputs cannot produce malformed price conditions", () => {
  const run = fixture(); run.context.dailyTechnical.support = 1e300; run.context.dailyTechnical.resistance = 1e300; run.context.dailyTechnical.bollinger = null; run.context.dailyTechnical.ma["20"] = 1e300;
  assert.deepEqual(tradeCandidates(run, now), []);
  for (const mutate of [
    (r: StoredCouncilRun) => { r.context.dailyTechnical.rsi = null; },
    (r: StoredCouncilRun) => { r.context.dailyTechnical.histogram = NaN; },
    (r: StoredCouncilRun) => { r.context.dailyTechnical.ma["20"] = null; },
  ]) { const r = fixture(); mutate(r); assert.deepEqual(tradeCandidates(r, now), []); }
});
test("expired plans, fresh quote invalidation and quote failures turn into HOLD without model calls", () => {
  const run = fixture(), plan = resolveTradePlan(run, decision("BUY", "buy-support"), now);
  const quote: Quote = { ...run.context.asset, mode: "POLL", changeBasis: "PREVIOUS_CLOSE", delayMinutes: null };
  assert.equal(effectiveTradePlan(plan, now, quote)!.action, "BUY");
  assert.equal(effectiveTradePlan(plan, Date.parse(plan.validUntil))!.action, "HOLD");
  assert.equal(effectiveTradePlan(plan, now, { ...quote, price: 1500000 })!.action, "HOLD");
  assert.equal(effectiveTradePlan(plan, now, { ...quote, price: 1800000 })!.action, "HOLD");
  assert.equal(effectiveTradePlan(plan, now, { ...quote, stale: true })!.action, "HOLD");
  assert.equal(effectiveTradePlan(plan, now, null)!.action, "HOLD");
  const sell = resolveTradePlan(run, decision("SELL", "sell-support"), now);
  assert.equal(effectiveTradePlan(sell, now, { ...quote, price: 1629999 })!.action, "SELL");
  assert.equal(effectiveTradePlan(sell, now, quote)!.action, "SELL", "A future support-loss condition is not invalid just because price has not fallen yet");
  assert.equal(effectiveTradePlan({ ...sell, referencePrice: 1590000 }, now, quote)!.action, "HOLD", "A previously breached support plan is invalid on recovery");
});
test("Bitcoin and indices retain USD/pt units, shorter crypto expiry and no executable index orders", () => {
  for (const asset of ["bitcoin", "nasdaq", "kospi"] as const) {
    const run = fixture(asset), plan = resolveTradePlan(run, decision("BUY", "buy-support"), now);
    assert.equal(plan.unit, asset === "bitcoin" ? "USD" : "pt");
    assert.ok(formatPriceCondition(plan.candidate!.trigger, plan.unit).includes(plan.unit));
    assert.equal(Date.parse(plan.validUntil) - Date.parse(run.createdAt), (asset === "bitcoin" ? 6 : 24) * 3600000);
  }
});
test("public history expires a plan without exposing context or mutating its stored action", () => {
  const run = fixture(); run.tradePlan = resolveTradePlan(run, decision("BUY", "buy-support"), now); run.tradePlan.validUntil = "2000-01-01T00:00:00Z";
  const result = publicRun(run); assert.equal(result.tradePlan!.action, "HOLD"); assert.equal(run.tradePlan.action, "BUY"); assert.equal("context" in result, false);
});
test("master prompt includes only chart-derived scenarios, missing-data status and conditional guardrails", () => {
  const run = fixture(); run.marketAsOf = new Date().toISOString(); run.context.asset.quoteTime = new Date().toISOString(); run.dailyBarTime = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const prompt = councilPrompt("master", run);
  assert.ok(prompt.instructions.includes("tradeDecision")); assert.ok(prompt.instructions.includes("공매도 주문이 아니다"));
  assert.ok("TRADE_CANDIDATES" in prompt.data); assert.ok("TRADE_DATA_ISSUE" in prompt.data);
  assert.equal("TRADE_CANDIDATES" in councilPrompt("bollinger", run).data, false);
});

test("HOLD can carry a separately validated captain-selected buy watch, never a BUY verdict", () => {
  const run = fixture(), plan = resolveTradePlan(run, { ...decision("HOLD", null), watchCandidateId: "buy-support" }, now);
  assert.equal(plan.action, "HOLD"); assert.equal(plan.candidate, null);
  assert.equal(plan.buyWatch!.selectedBy, "MASTER"); assert.equal(buyScenario(plan)!.trigger.price, 1600000);
  assert.equal(resolveTradePlan(run, { ...decision("HOLD", null), watchCandidateId: null }, now).buyWatch, null);
  assert.equal(resolveTradePlan(run, { ...decision("HOLD", null), watchCandidateId: "sell-support" }, now).buyWatch, null);
  assert.equal(resolveTradePlan(run, { ...decision("HOLD", null), watchCandidateId: "invented-price" }, now).buyWatch, null);
  assert.equal(resolveTradePlan(run, decision("HOLD", null), now).buyWatch!.selectedBy, "CHART", "Omitted field is labeled chart-derived, never falsely attributed to AI");
});
test("watch prices disappear for stale data, incomplete reports, expiry and price invalidation", () => {
  const run = fixture(), choice = { ...decision("HOLD", null), watchCandidateId: "buy-support" };
  const plan = resolveTradePlan(run, choice, now), quote: Quote = { ...run.context.asset, mode: "POLL", changeBasis: "PREVIOUS_CLOSE", delayMinutes: null };
  for (const value of [null, { ...quote, stale: true }, { ...quote, price: 1555000 }, { ...quote, price: 1750000 }]) assert.equal(buyScenario(effectiveTradePlan(plan, now, value)), null);
  assert.equal(buyScenario(effectiveTradePlan(plan, Date.parse(plan.validUntil), quote)), null);
  run.analysts[0].status = "error"; assert.equal(buyScenario(resolveTradePlan(run, choice, now)), null);
  run.analysts[0].status = "done"; run.stale = true; assert.equal(buyScenario(resolveTradePlan(run, choice, now)), null);
});
test("live distance and contact keep daily confirmation separate and exclude invalid ranges", () => {
  const candidate = buyScenario(resolveTradePlan(fixture(), { ...decision("HOLD", null), watchCandidateId: "buy-support" }, now))!;
  assert.ok(Math.abs(entryDistance(candidate, 1700000)! + 5.88235294117647) < 1e-8);
  assert.equal(entryDistance(candidate, 0), null); assert.equal(entryDistance(candidate, NaN), null);
  assert.equal(priceConditionTouched(candidate, 1600000), true); assert.equal(priceConditionTouched(candidate, 1600001), false);
  assert.equal(priceConditionTouched(candidate, 1555000), false); assert.equal(priceConditionTouched(candidate, 1750000), false);
  const reclaim = { ...candidate, trigger: { ...candidate.trigger, comparator: "CLOSE_ABOVE" as const } };
  assert.equal(priceConditionTouched(reclaim, 1600001), true, "Contact only, not a confirmed daily close");
});
test("simulation obeys both budgets, stock integer and Bitcoin fractional units, and blocks indices", () => {
  const candidate = buyScenario(resolveTradePlan(fixture(), { ...decision("HOLD", null), watchCandidateId: "buy-support" }, now))!;
  const stock = positionSimulation("hynix", candidate, 10000000, 100000)!;
  assert.equal(stock.quantity, 2); assert.equal(stock.investment, 3200000); assert.equal(stock.loss, 90000); assert.equal(stock.profit, 300000);
  const crypto = positionSimulation("bitcoin", candidate, 1000, 50)!;
  assert.ok(crypto.quantity < 1 && crypto.investment <= 1000 && crypto.loss <= 50);
  for (const asset of ["nasdaq", "kospi"] as const) assert.equal(positionSimulation(asset, candidate, 10000000, 100000), null);
  for (const budget of [0, -1, NaN, Infinity, Number.MAX_VALUE]) assert.equal(positionSimulation("hynix", candidate, budget, 100000), null);
  assert.equal(positionSimulation("hynix", candidate, 100, 100), null);
  assert.equal(positionSimulation("hynix", candidate, 10000000, 0), null);
});
test("watch expiry in public history removes numeric observation fields without mutating storage", () => {
  const run = fixture(); run.tradePlan = resolveTradePlan(run, { ...decision("HOLD", null), watchCandidateId: "buy-support" }, now);
  run.tradePlan.validUntil = "2000-01-01T00:00:00Z";
  assert.equal(publicRun(run).tradePlan!.buyWatch, null); assert.ok(run.tradePlan.buyWatch);
  const fresh = fixture(); fresh.marketAsOf = new Date().toISOString(); fresh.context.asset.quoteTime = new Date().toISOString(); fresh.dailyBarTime = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.ok(councilPrompt("master", fresh).instructions.includes("watchCandidateId"));
});
