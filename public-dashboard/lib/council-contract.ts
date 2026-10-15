import { z } from "zod";
import type { Asset, Candle, Macro, NewsItem, Quote, ResearchEvidence, Technical } from "./radar-types";
import { effectiveTradePlan, tradeDecisionSchema, type TradeDecision, type TradePlan } from "./trade-plan";

export const COUNCIL_ASSETS = ["hynix", "nasdaq", "bitcoin", "kospi"] as const;
export type CouncilAssetId = typeof COUNCIL_ASSETS[number];
export const ANALYSTS = [
  { id: "bollinger", name: "밴드", title: "볼린저 밴드 전문가", model: "gpt-6.1-sol", color: "#75dbc0", sprite: 0 },
  { id: "moving-average", name: "트렌", title: "이동평균선 전문가", model: "gpt-6.1-sol", color: "#8ec9f1", sprite: 1 },
  { id: "gpt", name: "리포", title: "실적 · 뉴스 분석가", model: "gpt-6.1-sol", color: "#e4a7cd", sprite: 2 },
  { id: "fable", name: "체크", title: "위험 · 반대 시나리오", model: "gpt-6.1-sol", color: "#efaa91", sprite: 3 },
  { id: "master", name: "캡틴", title: "마스터 · 종합 분석가", model: "gpt-6.1-sol", color: "#ead084", sprite: 4 },
] as const;
export const ANALYST_DEADLINE_MS = 150000;
export type AnalystId = typeof ANALYSTS[number]["id"];
export const STANCE_LABELS = { BULLISH: "상승 관점", NEUTRAL: "중립 관점", BEARISH: "하락 관점", INSUFFICIENT: "자료 부족" };
export const reportSchema = z.object({
  stance: z.enum(["BULLISH", "NEUTRAL", "BEARISH", "INSUFFICIENT"]),
  headline: z.string().min(1).max(120), summary: z.string().min(1).max(1600),
  findings: z.array(z.object({ observation: z.string().min(1).max(500), sourceId: z.string().min(1).max(160) }).strict()).max(5),
  upsideCondition: z.string().max(600), downsideCondition: z.string().max(600), caution: z.string().max(700), lesson: z.string().max(700),
  agreements: z.array(z.string().max(500)).max(4), disagreements: z.array(z.string().max(500)).max(4), watchpoints: z.array(z.string().max(500)).max(4),
}).strict();
// Strict generation requires every field; stored legacy decisions may omit the watch.
export const masterReportSchema = reportSchema.extend({ tradeDecision: tradeDecisionSchema.extend({ watchCandidateId: z.string().max(80).nullable() }) }).strict();
export type AnalystReport = z.infer<typeof reportSchema> & { tradeDecision?: TradeDecision };
export interface CouncilSource { id: string; title: string; url: string; date: string | null }
export interface CouncilContext {
  asset: Omit<Asset, "candles">; quote: Quote | null; dailyTechnical: Technical; previousTechnical: Technical;
  closedBars: Candle[]; dailyBarTime: string | null; marketAsOf: string; quoteAsOf: string | null;
  macro: Macro[]; news: NewsItem[]; evidence: ResearchEvidence[]; annualEstimates: unknown;
  memoryStatus: string; memory: unknown[]; warnings: string[];
}
export interface AnalystRecord {
  id: AnalystId; model: string; status: "pending" | "running" | "done" | "error";
  report: AnalystReport | null; startedAt: string | null; completedAt: string | null; error: string | null;
  attempts: number; tokens: { input: number | null; output: number | null; total: number | null } | null;
  deadlineAt?: string | null;
}
export interface CouncilRun {
  id: string; assetId: CouncilAssetId; assetName: string; createdAt: string; updatedAt: string;
  status: "pending" | "running" | "complete" | "partial" | "failed";
  marketAsOf: string; quoteAsOf: string | null; dailyBarTime: string | null; stale: boolean;
  sources: CouncilSource[]; warnings: string[]; analysts: AnalystRecord[];
  tradePlan?: TradePlan;
}
export interface StoredCouncilRun extends CouncilRun { context: CouncilContext; createdBy: string; revision?: string }
export interface CouncilUsage { day: string; analysisCalls: number; chatCalls: number; totalCalls: number; unlimited: true }
export const councilInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), assetId: z.enum(COUNCIL_ASSETS), requestId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("step"), runId: z.string().uuid(), analystId: z.enum(["bollinger", "moving-average", "gpt", "fable", "master"]) }).strict(),
  z.object({ action: z.literal("retry"), runId: z.string().uuid() }).strict(),
]);
export const publicRun = ({ context: _context, createdBy: _createdBy, revision: _revision, ...run }: StoredCouncilRun): CouncilRun => ({ ...run, ...(run.tradePlan ? { tradePlan: effectiveTradePlan(run.tradePlan) } : {}) });
export function nextAnalyst(run: CouncilRun) { return run.analysts.find((item) => item.status === "pending" || item.status === "running"); }
export function finishRun(run: CouncilRun) {
  if (nextAnalyst(run)) { run.status = "running"; return; }
  const master = run.analysts.find((item) => item.id === "master");
  run.status = master?.status !== "done" ? "failed" : run.analysts.some((item) => item.status === "error") ? "partial" : "complete";
}
export function sanitizeReport(report: AnalystReport, run: CouncilRun): AnalystReport {
  const ids = new Set(run.sources.map((item) => item.id));
  const findings = report.findings.filter((item) => ids.has(item.sourceId));
  return { ...report, findings, ...(run.stale ? { stance: "INSUFFICIENT" as const,
    caution: `일부 시세 또는 일봉 자료의 최신성 확인이 필요합니다. ${report.caution}` } : {}) };
}
