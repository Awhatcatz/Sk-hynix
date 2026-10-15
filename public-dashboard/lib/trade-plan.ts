import { z } from "zod";
import { quoteIsStale } from "./market-time";
import type { CouncilRun, StoredCouncilRun } from "./council-contract";
import type { Quote } from "./radar-types";

export const tradeDecisionSchema = z.object({
  action: z.enum(["BUY", "HOLD", "SELL"]),
  candidateId: z.string().max(80).nullable(),
  watchCandidateId: z.string().max(80).nullable().optional(),
  reason: z.string().min(1).max(700),
}).strict();
export type TradeDecision = z.infer<typeof tradeDecisionSchema>;
export interface PriceCondition {
  price: number;
  comparator: "AT_OR_BELOW" | "CLOSE_ABOVE" | "CLOSE_BELOW" | "AT_OR_ABOVE";
  basis: string;
}
export interface TradeCandidate {
  id: string; action: "BUY" | "SELL"; name: string;
  trigger: PriceCondition; target: PriceCondition | null; invalidation: PriceCondition;
  confirmation: string; riskReward: number | null;
}
export interface TradePlan {
  action: "BUY" | "HOLD" | "SELL";
  candidate: TradeCandidate | null; reason: string;
  buyWatch?: { candidate: TradeCandidate; selectedBy: "MASTER" | "CHART" } | null;
  asOf: string; validUntil: string; dailyBarTime: string | null;
  unit: string; referencePrice: number | null; referenceTime: string | null;
}
const positive = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const rounded = (n: number, unit: string) => Math.abs(n) > 1e14 ? NaN : unit === "원" ? Math.round(n) : Math.round(n * 100) / 100;

export function planDataIssue(run: StoredCouncilRun, now = Date.now()): string | null {
  const quote = run.context.quote || run.context.asset;
  if (run.stale || quote.stale || !positive(quote.price) || !quote.quoteTime || quoteIsStale(run.assetId, Date.parse(quote.quoteTime) / 1000, new Date(now))) return "시세 또는 확정 일봉의 최신성을 확인하지 못해 보류합니다.";
  if (!Number.isFinite(Date.parse(run.marketAsOf)) || now - Date.parse(run.marketAsOf) > 15 * 60000 || Date.parse(run.marketAsOf) > now + 300000) return "분석 자료를 조회한 지 오래돼 새 분석이 필요합니다.";
  const barTime = Date.parse(run.dailyBarTime || "");
  if (!Number.isFinite(barTime) || barTime > now || now - barTime > (run.assetId === "bitcoin" ? 2 : 7) * 86400000) return "최근 확정 일봉이 없어 가격 조건을 제시하지 않습니다.";
  return null;
}

// The model selects a complete chart-derived scenario; it cannot invent its prices.
export function tradeCandidates(run: StoredCouncilRun, now = Date.now()): TradeCandidate[] {
  if (planDataIssue(run, now)) return [];
  const t = run.context.dailyTechnical, unit = run.context.asset.unit;
  const price = (run.context.quote || run.context.asset).price!;
  if (!positive(t.atr) || t.atr / price > .2 || !positive(t.ma["20"]) || t.rsi === null || !Number.isFinite(t.rsi) || t.rsi < 0 || t.rsi > 100 || t.histogram === null || !Number.isFinite(t.histogram)) return [];
  const atr = t.atr, round = (n: number) => rounded(n, unit);
  const levels = [
    { id: "support", price: t.support, basis: "최근 20개 확정 일봉 저가의 최솟값" },
    { id: "lower-band", price: t.bollinger?.lower, basis: "볼린저 하단 (20일 · 2σ)" },
    { id: "ma20", price: t.ma["20"], basis: "20일 단순 이동평균선" },
  ];
  const targets = [
    { price: t.bollinger?.middle, basis: "볼린저 중심선 (20일 평균)" },
    { price: t.bollinger?.upper, basis: "볼린저 상단 (20일 · 2σ)" },
    { price: t.resistance, basis: "최근 20개 확정 일봉 고가의 최댓값" },
  ].filter((level): level is { price: number; basis: string } => positive(level.price)).sort((a, b) => a.price - b.price);
  const candidates: TradeCandidate[] = [];
  for (const level of levels) {
    if (!positive(level.price) || level.price > price * 1.15 || level.price < price * .75) continue;
    const entry = round(level.price), stop = round(entry - 1.5 * atr);
    const target = targets.find((item) => round(item.price) > Math.max(entry, price) && (round(item.price) - entry) / (entry - stop) >= 1.5);
    if (!positive(stop) || stop >= entry || !target || price <= stop || price >= round(target.price)) continue;
    const reclaim = level.id === "ma20";
    candidates.push({ id: `buy-${level.id}`, action: "BUY", name: reclaim ? "20일선 회복" : "지지 구간 반등",
      trigger: { price: entry, comparator: reclaim ? "CLOSE_ABOVE" : "AT_OR_BELOW", basis: level.basis },
      target: { price: round(target.price), comparator: "AT_OR_ABOVE", basis: target.basis },
      invalidation: { price: stop, comparator: "CLOSE_BELOW", basis: "진입 기준 − 1.5 × ATR(14) · 변동성 완충" },
      confirmation: reclaim ? "새 확정 일봉이 20일선을 아래에서 위로 회복하고 RSI가 40~70, MACD 히스토그램이 0 이상일 때만 검토" : "무효화 가격보다 높은 구간에서 볼린저 하단 재진입과 직전 종가 대비 반등을 새 확정 일봉으로 확인한 뒤 검토",
      riskReward: Math.round((round(target.price) - entry) / (entry - stop) * 100) / 100 });
  }
  if (positive(t.support) && positive(t.support + atr)) candidates.push({ id: "sell-support", action: "SELL", name: "지지선 이탈 · 보유 위험 축소",
    trigger: { price: round(t.support), comparator: "CLOSE_BELOW", basis: "최근 20개 확정 일봉 저가의 최솟값" }, target: null,
    invalidation: { price: round(t.support + atr), comparator: "CLOSE_ABOVE", basis: "지지선 + ATR(14) 회복" },
    confirmation: "새 확정 일봉의 지지선 하향 이탈과 하락 추세를 확인한 뒤 보유 물량 축소 검토 · 공매도 신호 아님", riskReward: null });
  if (positive(t.resistance)) candidates.push({ id: "sell-resistance", action: "SELL", name: "저항 구간 · 보유 이익 실현",
    trigger: { price: round(t.resistance), comparator: "AT_OR_ABOVE", basis: "최근 20개 확정 일봉 고가의 최댓값" }, target: null,
    invalidation: { price: round(t.resistance + atr), comparator: "CLOSE_ABOVE", basis: "저항선 + ATR(14) 돌파" },
    confirmation: "저항 구간에 도달한 뒤 새 확정 일봉의 상승 탄력 둔화 또는 되밀림 확인 · 강한 상승 추세에서는 상단 접촉만으로 매도하지 않음", riskReward: null });
  return candidates.filter((candidate) => positive(candidate.trigger.price) && positive(candidate.invalidation.price) && (candidate.target === null || positive(candidate.target.price)) &&
    (candidate.action === "BUY" ? candidate.invalidation.price < candidate.trigger.price && candidate.trigger.price < candidate.target!.price && Number.isFinite(candidate.riskReward) : candidate.trigger.price < candidate.invalidation.price));
}

export function resolveTradePlan(run: StoredCouncilRun, decision: TradeDecision | undefined, now = Date.now()): TradePlan {
  const quote = run.context.quote || run.context.asset;
  const base = { asOf: new Date(now).toISOString(), validUntil: new Date(Math.min(now, Date.parse(run.createdAt)) + (run.assetId === "bitcoin" ? 6 : 24) * 3600000).toISOString(),
    dailyBarTime: run.dailyBarTime, unit: run.context.asset.unit, referencePrice: quote.price, referenceTime: quote.quoteTime };
  const hold = (reason: string): TradePlan => ({ ...base, action: "HOLD", candidate: null, reason });
  const issue = planDataIssue(run, now);
  if (issue) return hold(issue);
  if (run.analysts.some((item) => item.id !== "master" && (item.status !== "done" || !item.report || item.report.stance === "INSUFFICIENT"))) return hold("전문가 분석이 일부 누락됐거나 자료가 부족해 구체적인 가격 신호를 보류합니다.");
  if (run.analysts.find((item) => item.id === "master")?.report?.stance === "INSUFFICIENT") return hold("캡틴이 근거 부족을 판단해 가격 신호를 보류합니다.");
  if (!decision) return hold("이전 형식의 분석에는 검증된 가격 조건이 없습니다. 새 AI 분석이 필요합니다.");
  const candidates = tradeCandidates(run, now);
  if (decision.action === "HOLD") {
    // A watch price is not a BUY verdict or confirmation that the entry is ready.
    const watched = decision.watchCandidateId === undefined
      ? candidates.filter((item) => item.action === "BUY").sort((a, b) => Math.abs(a.trigger.price / quote.price! - 1) - Math.abs(b.trigger.price / quote.price! - 1))[0]
      : candidates.find((item) => item.id === decision.watchCandidateId && item.action === "BUY");
    return effectiveTradePlan({ ...hold(decision.reason), buyWatch: watched ? { candidate: watched, selectedBy: decision.watchCandidateId === undefined ? "CHART" : "MASTER" } : null }, now)!;
  }
  const candidate = candidates.find((item) => item.id === decision.candidateId && item.action === decision.action);
  if (!candidate) return hold("캡틴의 가격 조건을 차트 자료와 대조하지 못해 보류합니다.");
  return effectiveTradePlan({ ...base, action: decision.action, candidate, reason: decision.reason }, now)!;
}

export function effectiveTradePlan(plan: TradePlan | undefined, now = Date.now(), quote?: Quote | null): TradePlan | undefined {
  if (!plan) return undefined;
  const hold = (reason: string): TradePlan => ({ ...plan, action: "HOLD", candidate: null, buyWatch: null, reason });
  if (!Number.isFinite(Date.parse(plan.validUntil)) || now >= Date.parse(plan.validUntil)) return hold("가격 조건의 유효 시간이 지났습니다. 새 AI 분석이 필요합니다.");
  if (quote === null) return hold("현재 시세를 확인하지 못해 가격 조건을 보류합니다.");
  if (quote && (quote.stale || !positive(quote.price) || !quote.quoteTime || quoteIsStale(quote.id, Date.parse(quote.quoteTime) / 1000, new Date(now)))) return hold("현재 시세의 최신성을 확인할 수 없어 가격 조건을 보류합니다.");
  const current = quote?.price;
  const watch = plan.buyWatch?.candidate;
  if (watch && (!validBuyCandidate(watch) || (positive(current) && (current <= watch.invalidation.price || current >= watch.target!.price)))) return hold("매수 관찰 시나리오의 범위를 벗어났습니다. 새 AI 분석으로 가격 조건을 다시 확인하세요.");
  if (positive(current) && plan.candidate?.action === "BUY" && (current <= plan.candidate.invalidation.price || current >= plan.candidate.target!.price)) return hold("현재 가격이 기존 진입 시나리오의 범위를 벗어났습니다. 새 분석이 필요합니다.");
  const sell = plan.candidate?.action === "SELL" ? plan.candidate : null;
  const sellWasTriggered = sell && positive(plan.referencePrice) && (sell.trigger.comparator === "CLOSE_BELOW" ? plan.referencePrice < sell.trigger.price : plan.referencePrice >= sell.trigger.price);
  if (positive(current) && sell && (sellWasTriggered || sell.id === "sell-resistance") && current >= sell.invalidation.price) return hold("현재 가격이 매도 시나리오의 무효화 구간에 도달했습니다. 새 분석이 필요합니다.");
  return plan;
}

export function validBuyCandidate(candidate: TradeCandidate): boolean {
  return candidate.action === "BUY" && positive(candidate.trigger.price) && positive(candidate.invalidation.price) && positive(candidate.target?.price) &&
    candidate.invalidation.price < candidate.trigger.price && candidate.trigger.price < candidate.target.price && positive(candidate.riskReward) && candidate.riskReward >= 1.5;
}

export function buyScenario(plan: TradePlan | undefined): TradeCandidate | null {
  const candidate = plan?.action === "BUY" ? plan.candidate : plan?.action === "HOLD" ? plan.buyWatch?.candidate : null;
  return candidate && validBuyCandidate(candidate) ? candidate : null;
}

export function formatPriceCondition(condition: PriceCondition, unit: string): string {
  const price = `${condition.price.toLocaleString("ko-KR", { maximumFractionDigits: unit === "원" ? 0 : 2 })}${unit === "원" ? "원" : ` ${unit}`}`;
  const endings = { AT_OR_BELOW: "이하", CLOSE_ABOVE: "초과 종가 확인", CLOSE_BELOW: "미만 종가 확인", AT_OR_ABOVE: "이상" };
  return `${price} ${endings[condition.comparator]}`;
}
