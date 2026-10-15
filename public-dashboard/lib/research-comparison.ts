import type { ResearchEvidence } from "./radar-types";
export function compareEstimates(evidence: ResearchEvidence[]) {
  const brokers = evidence.filter((item) => item.kind === "BROKER_ESTIMATE").sort((a, b) => b.published.localeCompare(a.published));
  const latest = brokers[0];
  if (!latest) return [];
  const publishers = new Set<string>();
  const samePeriod = brokers.filter((item) => {
    if (item.period !== latest.period || publishers.has(item.publisher)) return false;
    publishers.add(item.publisher); return true;
  });
  return ["연결 매출", "연결 영업이익"].flatMap((name) => {
    const values = samePeriod.map((item) => item.metrics.find((metric) => metric.name === name && metric.unit === "조원"))
      .filter((metric) => metric && /^[\d,.]+$/.test(metric.value)).map((metric) => Number(metric!.value.replace(/,/g, ""))).filter(Number.isFinite);
    if (values.length < 2) return [];
    const low = Math.min(...values), high = Math.max(...values);
    return [{ name, period: latest.period, unit: "조원", low, high, count: values.length, spreadPct: low > 0 ? (high / low - 1) * 100 : null }];
  });
}
