import type { ResearchEvidence } from "./radar-types";

export type AnnualYear = 2026 | 2027;
export type ValuationMethod = "PER" | "PBR";
export type ForecastMetric = "revenue" | "operatingProfit" | "targetPrice";
export const BROKER_MEAN_LABEL = "등록 증권사 단순 평균, 컨센서스 아님";
export const ANNUAL_YEARS: readonly AnnualYear[] = [2026, 2027];
export const FORECAST_METRICS = {
  revenue: { label: "연결 매출", unit: "조원" },
  operatingProfit: { label: "연결 영업이익", unit: "조원" },
  targetPrice: { label: "목표주가", unit: "원/주" },
} as const;

export const ANNUAL_SOURCES = {
  ibk: {
    publisher: "IBK투자증권", title: "실적에 수급을 더한다", authors: "김운호·고혁진",
    published: "2026-10-07", posted: "2026-10-07 07:18", verifiedAt: "2026-10-12", page: 4,
    url: "https://www.ibks.com/company/common/download.jsp?filepath=/files/tradeinfo/busreport&filename=20260929181705673_ko.pdf",
    publisherUrl: "https://www.ibks.com/investment/research/businessAnalysis_view.do?seq=12557&popup=null",
    evidence: "p.4 투자지표 EPS·BPS / 포괄손익계산서 지배주주당기순이익. 하단 주석: 주당지표 및 밸류에이션은 지배주주순익 및 지배주주지분 기준. EPS·순이익은 p.1에서도 일치.",
    shares: { value: 730492, unit: "천주", asOf: "2026-10-06", page: 1, basis: "시장정보 발행주식수, 연간 EPS 분모 아님" },
  },
  shinhan: {
    publisher: "신한투자증권", title: "흔들림 없는 실적 우상향", authors: "김형태·송혜수",
    published: "2026-09-30", posted: null, verifiedAt: "2026-10-12", page: 6,
    url: "https://stock.pstatic.net/stock-research/company/21/20260930_company_263799000.pdf",
    publisherUrl: null,
    evidence: "p.6 주요 투자지표 EPS(지배순이익, 원)·BPS(지배지분, 원) / 포괄손익계산서 (지배주주)당기순이익. 신한 작성 원문, 네이버 공개 PDF 호스팅.",
    shares: { value: 730.5, unit: "백만주", asOf: "2026-09-29", page: 1, basis: "시장정보 발행주식수, 연간 EPS 분모 아님" },
  },
} as const;

export interface AnnualForecast {
  sourceId: keyof typeof ANNUAL_SOURCES;
  year: AnnualYear;
  period: string;
  fiscalYearEnd: "12월";
  basis: "지배주주";
  unit: "원/주";
  eps: number;
  bps: number;
  attributableNetProfit: number;
  netProfitUnit: "십억원";
}

// Annual originals are independent of quarterly ResearchEvidence and 12MF bases.
export const ANNUAL_FORECASTS: readonly AnnualForecast[] = [
  { sourceId: "ibk", year: 2026, period: "2026F", fiscalYearEnd: "12월", basis: "지배주주", unit: "원/주", eps: 369678, bps: 540641, attributableNetProfit: 267156, netProfitUnit: "십억원" },
  { sourceId: "ibk", year: 2027, period: "2027F", fiscalYearEnd: "12월", basis: "지배주주", unit: "원/주", eps: 479295, bps: 1006176, attributableNetProfit: 350122, netProfitUnit: "십억원" },
  { sourceId: "shinhan", year: 2026, period: "2026F", fiscalYearEnd: "12월", basis: "지배주주", unit: "원/주", eps: 346550, bps: 520952, attributableNetProfit: 249024.9, netProfitUnit: "십억원" },
  { sourceId: "shinhan", year: 2027, period: "2027F", fiscalYearEnd: "12월", basis: "지배주주", unit: "원/주", eps: 434449, bps: 930593, attributableNetProfit: 306904.3, netProfitUnit: "십억원" },
];

export const ANNUAL_ESTIMATES = ANNUAL_FORECASTS.map((forecast) => {
  const source = ANNUAL_SOURCES[forecast.sourceId];
  return { ...forecast, publisher: source.publisher, published: source.published, url: source.url,
    page: source.page, verifiedAt: source.verifiedAt, source };
});

export function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isValidAnnualForecast(value: AnnualForecast): boolean {
  return ANNUAL_YEARS.includes(value.year) && value.period === `${value.year}F`
    && value.fiscalYearEnd === "12월" && value.basis === "지배주주" && value.unit === "원/주"
    && Object.hasOwn(ANNUAL_SOURCES, value.sourceId) && isFinitePositive(value.eps) && isFinitePositive(value.bps);
}

export function calculateExpectedPrice(annualBase: number, multiple: number): number | null {
  if (!isFinitePositive(annualBase) || !isFinitePositive(multiple)) return null;
  const price = annualBase * multiple;
  return isFinitePositive(price) ? price : null;
}

export function arithmeticMean(values: readonly number[]): number | null {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  const mean = values.reduce((sum, value) => sum + value / values.length, 0);
  return Number.isFinite(mean) ? mean : null;
}

export function priceDifference(price: number, currentPrice: number | null) {
  if (!isFinitePositive(price) || !isFinitePositive(currentPrice)) return null;
  const amount = price - currentPrice;
  const percent = amount / currentPrice * 100;
  return Number.isFinite(amount) && Number.isFinite(percent) ? { amount, percent } : null;
}

export function buildValuationScenario(year: AnnualYear, method: ValuationMethod, multiple: number, currentPrice: number | null) {
  const calculated = ANNUAL_FORECASTS.filter((item) => item.year === year && isValidAnnualForecast(item)).map((forecast) => {
    if (method !== "PER" && method !== "PBR") return null;
    const base = method === "PER" ? forecast.eps : forecast.bps;
    const expectedPrice = calculateExpectedPrice(base, multiple);
    if (expectedPrice === null) return null;
    return { forecast, source: ANNUAL_SOURCES[forecast.sourceId], base, expectedPrice, difference: priceDifference(expectedPrice, currentPrice) };
  });
  const rows = calculated.some((row) => row === null) ? [] : calculated.filter((row) => row !== null);
  const meanPrice = arithmeticMean(rows.map((row) => row.expectedPrice));
  return { year, method, multiple, rows, meanPrice, meanDifference: meanPrice === null ? null : priceDifference(meanPrice, currentPrice) };
}

export function getValuationChatContext(selection?: { year: AnnualYear; method: ValuationMethod; multiple: number; currentPrice: number | null }) {
  return {
    company: "SK하이닉스", symbol: "000660", meanLabel: BROKER_MEAN_LABEL,
    methodology: "12월 결산 연간 지배주주 EPS × 사용자 PER 또는 BPS × 사용자 PBR. 배수는 예시 가정이며 투자 권고가 아님.",
    exclusions: "분기 × 4, 영업이익을 EPS로 대체, 시장정보 발행주식수로 EPS 재계산, 12개월 선행 EPS/BPS를 연간값으로 대체하지 않음.",
    forecasts: ANNUAL_ESTIMATES,
    scenario: selection ? buildValuationScenario(selection.year, selection.method, selection.multiple, selection.currentPrice) : null,
  };
}

export function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function validReportDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = Date.parse(value);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value;
}

export function quarterPeriod(value: string): string | null {
  const match = /^(20\d{2})Q([1-4])(?:E|F)?$/i.exec(value.trim());
  return match ? `${match[1]}Q${match[2]}E` : null;
}

function comparableReport(item: ResearchEvidence): boolean {
  return item.kind === "BROKER_ESTIMATE" && !!item.publisher.trim() && !!quarterPeriod(item.period)
    && validReportDate(item.published) && !!safeSourceUrl(item.url);
}

export function getForecastPeriods(evidence: readonly ResearchEvidence[]): string[] {
  return [...new Set(evidence.filter(comparableReport).map((item) => quarterPeriod(item.period)!))].sort().reverse();
}

export function parseForecastValue(value: string): number | null {
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/.test(text)) return null;
  const number = Number(text.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

export interface ForecastComparisonRow {
  evidenceId: string;
  publisher: string;
  value: number;
  published: string;
  url: string;
}

export function buildForecastComparison(evidence: readonly ResearchEvidence[], metric: ForecastMetric, period: string) {
  const selectedPeriod = quarterPeriod(period);
  const definition = FORECAST_METRICS[metric];
  const latest = new Map<string, ResearchEvidence>();
  // Select reports first: absent/invalid new values must never revive an older one.
  for (const report of evidence) {
    if (!selectedPeriod || !comparableReport(report) || quarterPeriod(report.period) !== selectedPeriod) continue;
    const publisher = report.publisher.trim();
    const previous = latest.get(publisher);
    if (!previous || report.published > previous.published || (report.published === previous.published && report.id > previous.id)) latest.set(publisher, report);
  }
  const rows: ForecastComparisonRow[] = [];
  for (const [publisher, report] of latest) {
    const matches = report.metrics.filter((item) => item.name === definition.label);
    if (matches.length !== 1) continue;
    const observation = matches[0];
    const matchingUnit = metric === "targetPrice"
      ? /^원\/주(?:\s*·\s*(?:유지|상향|하향))?$/.test(observation.unit.trim())
      : observation.unit.trim() === definition.unit;
    const value = parseForecastValue(observation.value);
    if (!matchingUnit || value === null || (metric === "targetPrice" && value <= 0) || (metric === "revenue" && value < 0)) continue;
    rows.push({ evidenceId: report.id, publisher, value, published: report.published, url: safeSourceUrl(report.url)! });
  }
  rows.sort((a, b) => b.published.localeCompare(a.published) || a.publisher.localeCompare(b.publisher, "ko"));
  return { metric, period: selectedPeriod, unit: definition.unit, rows, count: rows.length, mean: arithmeticMean(rows.map((row) => row.value)) };
}

export function horizontalPosition(value: number, minimum: number, maximum: number): number | null {
  if (![value, minimum, maximum].every(Number.isFinite) || minimum > maximum) return null;
  if (minimum === maximum) return 50;
  const magnitude = Math.max(Math.abs(minimum), Math.abs(maximum), 1);
  const ratio = (value / magnitude - minimum / magnitude) / (maximum / magnitude - minimum / magnitude);
  return Math.max(0, Math.min(100, ratio * 100));
}
