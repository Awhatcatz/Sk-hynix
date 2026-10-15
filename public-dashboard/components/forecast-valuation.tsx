"use client";

import { useId, useState } from "react";
import { Calculator, ChartBar, ExternalLink, FileText } from "lucide-react";
import type { ResearchEvidence } from "../lib/radar-types";
import {
  ANNUAL_FORECASTS, ANNUAL_SOURCES, ANNUAL_YEARS, BROKER_MEAN_LABEL, FORECAST_METRICS,
  buildForecastComparison, buildValuationScenario, getForecastPeriods, horizontalPosition, isFinitePositive,
  type AnnualYear, type ForecastMetric, type ValuationMethod,
} from "../lib/valuation";
import "./forecast-valuation.css";

export interface ForecastValuationProps {
  evidence: ResearchEvidence[];
  currentPrice: number | null;
}

interface PlotRow {
  id: string;
  label: string;
  value: number;
  detail: string;
  date?: string;
  url?: string;
  page?: number;
  mean?: boolean;
  difference?: { amount: number; percent: number } | null;
}

const number = (value: number, decimals = 0) => value.toLocaleString("ko-KR", { maximumFractionDigits: decimals });
const signed = (value: number, decimals = 0) => value.toLocaleString("ko-KR", { maximumFractionDigits: decimals, signDisplay: "always" });

function HorizontalPlot({ rows, title, unit, decimals = 0, reference = null }: {
  rows: PlotRow[]; title: string; unit: string; decimals?: number; reference?: number | null;
}) {
  const referencePrice = isFinitePositive(reference) ? reference : null;
  const values = rows.map((row) => row.value);
  if (referencePrice !== null) values.push(referencePrice);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const zero = horizontalPosition(0, minimum, maximum) ?? 50;
  const referencePosition = referencePrice === null ? null : horizontalPosition(referencePrice, minimum, maximum);
  return <div className="fv-plot">
    <table className="fv-plot-table" role="table">
      <caption className="fv-sr-only">{title} · {unit}. {BROKER_MEAN_LABEL}{referencePrice !== null ? ` · 현재가 ${number(referencePrice)}원` : ""}</caption>
      <thead className="fv-sr-only"><tr role="row"><th scope="col">증권사·발표일·근거</th><th scope="col">수평 차트</th><th scope="col">값·현재가 대비 차이</th></tr></thead>
      <tbody role="rowgroup">{rows.map((row) => {
        const position = horizontalPosition(row.value, minimum, maximum) ?? 50;
        return <tr key={row.id} role="row" className={row.mean ? "fv-mean-row" : undefined}>
          <th scope="row" role="rowheader" className="fv-row-label">
            <span>{row.label}</span><small>{row.detail}</small>
            {row.url && <a href={row.page ? `${row.url}#page=${row.page}` : row.url} target="_blank" rel="noreferrer">
              {row.date && <time dateTime={row.date}>{row.date}</time>}{row.page ? ` · PDF ${row.page}쪽` : " · 원문"}<ExternalLink size={11} aria-hidden="true" />
            </a>}
          </th>
          <td role="cell" className="fv-track-cell"><div className="fv-track" aria-hidden="true">
            <span className="fv-zero" style={{ left: `${zero}%` }} />
            <span className="fv-bar" style={{ left: `${Math.min(zero, position)}%`, width: `${Math.abs(position - zero)}%` }} />
            {referencePosition !== null && <span className="fv-reference" style={{ left: `${referencePosition}%` }} />}
            <span className="fv-marker" style={{ left: `${position}%` }} />
          </div><span className="fv-sr-only">{number(row.value, decimals)} {unit}</span></td>
          <td role="cell" className="fv-row-value"><strong>{number(row.value, decimals)} <small>{unit}</small></strong>
            {row.difference && <small>현재가 대비 {signed(row.difference.percent, 2)}%<span>{signed(row.difference.amount)}원</span></small>}
          </td>
        </tr>;
      })}</tbody>
    </table>
    {!!rows.length && <div className="fv-axis" aria-hidden="true"><span>{number(minimum, decimals)}</span><span>{number(maximum, decimals)} {unit}</span></div>}
  </div>;
}

export default function ForecastValuation({ evidence, currentPrice }: ForecastValuationProps) {
  const id = useId();
  const [metric, setMetric] = useState<ForecastMetric>("revenue");
  const [period, setPeriod] = useState("");
  const [year, setYear] = useState<AnnualYear>(2026);
  const [method, setMethod] = useState<ValuationMethod>("PER");
  const [multiples, setMultiples] = useState({ PER: "10", PBR: "1" });
  const periods = getForecastPeriods(evidence);
  const selectedPeriod = periods.includes(period) ? period : periods[0] ?? "";
  const comparison = buildForecastComparison(evidence, metric, selectedPeriod);
  const multipleText = multiples[method];
  const multiple = multipleText.trim() ? Number(multipleText) : NaN;
  const validMultiple = isFinitePositive(multiple);
  const scenario = buildValuationScenario(year, method, multiple, currentPrice);
  const quote = isFinitePositive(currentPrice) ? currentPrice : null;
  const basis = method === "PER" ? "EPS" : "BPS";
  const forecastRows: PlotRow[] = comparison.rows.map((row) => ({
    id: row.evidenceId, label: row.publisher, value: row.value, detail: selectedPeriod,
    date: row.published, url: row.url,
  }));
  if (comparison.mean !== null) forecastRows.push({
    id: "forecast-mean", label: "단순 평균", value: comparison.mean, detail: `${comparison.count}개 증권사 · 동일 분기·단위`, mean: true,
  });
  const valuationRows: PlotRow[] = scenario.rows.map((row) => ({
    id: row.forecast.sourceId, label: row.source.publisher, value: row.expectedPrice,
    detail: `${row.forecast.period} ${basis} ${number(row.base)}원`, date: row.source.published,
    url: row.source.url, page: row.source.page, difference: row.difference,
  }));
  if (scenario.meanPrice !== null) valuationRows.push({
    id: "valuation-mean", label: "단순 평균", value: scenario.meanPrice, detail: `${scenario.rows.length}개 증권사 · 같은 배수 가정`, mean: true, difference: scenario.meanDifference,
  });
  return <div className="forecast-valuation">
    <section className="fv-section" aria-labelledby={`${id}-forecast-title`}>
      <header className="fv-heading"><h3 id={`${id}-forecast-title`}><ChartBar size={16} aria-hidden="true" />증권사 분기 전망</h3>
        <div className="fv-controls">
          <label htmlFor={`${id}-period`}>대상 분기<select id={`${id}-period`} value={selectedPeriod} disabled={!periods.length} onChange={(event) => setPeriod(event.target.value)}>
            {!periods.length && <option value="">자료 없음</option>}{periods.map((value) => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <label htmlFor={`${id}-metric`}>비교 지표<select id={`${id}-metric`} value={metric} onChange={(event) => setMetric(event.target.value as ForecastMetric)}>
            {Object.entries(FORECAST_METRICS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </select></label>
        </div>
      </header>
      <p className="fv-note">{selectedPeriod || "대상 분기 미확인"} · {FORECAST_METRICS[metric].unit} · 유효 수치 {comparison.count}곳 · 발행 시점 차이 포함</p>
      {forecastRows.length ? <HorizontalPlot rows={forecastRows} title={`${selectedPeriod} ${FORECAST_METRICS[metric].label}`} unit={comparison.unit} decimals={metric === "targetPrice" ? 0 : 4} />
        : <p className="fv-empty" role="status">동일 분기·단위의 검증된 증권사 수치가 없습니다.</p>}
      <p className="fv-note fv-disclaimer">{BROKER_MEAN_LABEL}</p>
      {metric === "targetPrice" && <p className="fv-note">보고서 목표주가 · 실적 대상 분기로 묶음 · 목표주가 도달 시점은 동일하지 않을 수 있음 · 투자 권고 아님</p>}
    </section>

    <section className="fv-section" aria-labelledby={`${id}-valuation-title`}>
      <header className="fv-heading"><h3 id={`${id}-valuation-title`}><Calculator size={16} aria-hidden="true" />연간 EPS/BPS 가정 주가</h3>
        <div className="fv-controls">
          <label htmlFor={`${id}-year`}>결산 연도<select id={`${id}-year`} value={year} onChange={(event) => setYear(Number(event.target.value) as AnnualYear)}>
            {ANNUAL_YEARS.map((value) => <option key={value} value={value}>{value}F</option>)}
          </select></label>
          <fieldset className="fv-method"><legend>평가 기준</legend><div className="fv-segmented">{(["PER", "PBR"] as const).map((value) => <button key={value} type="button" aria-pressed={method === value} onClick={() => setMethod(value)}>{value}</button>)}</div></fieldset>
          <label htmlFor={`${id}-multiple`}>가정 배수 (배)<input id={`${id}-multiple`} type="number" min="0" step="any" required value={multipleText}
            aria-invalid={!validMultiple || scenario.meanPrice === null} aria-describedby={`${id}-assumption${!validMultiple || scenario.meanPrice === null ? ` ${id}-error` : ""}`}
            onChange={(event) => setMultiples((previous) => ({ ...previous, [method]: event.target.value }))} /></label>
        </div>
      </header>
      <div className="fv-valuation-meta"><p id={`${id}-assumption`} className="fv-note">{year}F · 12월 결산 · 지배주주 기준 · {basis} × {method} · 예시 가정, 투자 권고 아님</p>
        <p className="fv-quote">{quote === null ? "현재가 미확인 · 차이 산출 불가" : <><i aria-hidden="true" />현재가 {number(quote)}원</>}</p>
      </div>
      {!validMultiple || scenario.meanPrice === null ? <p id={`${id}-error`} className="fv-error" role="status">배수는 유한한 양수여야 하며 계산 결과는 유효한 범위여야 합니다.</p>
        : <HorizontalPlot rows={valuationRows} title={`${year}F ${method} ${number(multiple, 6)}배 가정 주가`} unit="원/주" reference={quote} />}
      <p className="fv-note fv-disclaimer">{BROKER_MEAN_LABEL} · 검증된 연간값만 사용 · 분기 연율화 및 12개월 선행값 제외</p>
      <details className="fv-sources"><summary><FileText size={14} aria-hidden="true" />연간 가정·원문 근거</summary>
        {Object.entries(ANNUAL_SOURCES).map(([sourceId, source]) => {
          const annual = ANNUAL_FORECASTS.find((item) => item.sourceId === sourceId && item.year === year)!;
          return <div className="fv-source" key={sourceId}>
            <h4>{source.publisher} · {source.title}</h4>
            <p className="fv-note">{source.authors} · 보고서 <time dateTime={source.published}>{source.published}</time> · 원문 확인 {source.verifiedAt}</p>
            <dl className="fv-bases"><div><dt>{annual.period} EPS · 원/주</dt><dd>{number(annual.eps)}</dd></div><div><dt>{annual.period} BPS · 원/주</dt><dd>{number(annual.bps)}</dd></div><div><dt>지배주주순이익 · 십억원</dt><dd>{number(annual.attributableNetProfit, 1)}</dd></div></dl>
            <p className="fv-note">{source.evidence}</p>
            <div className="fv-source-links"><a href={`${source.url}#page=${source.page}`} target="_blank" rel="noreferrer">PDF {source.page}쪽<ExternalLink size={12} aria-hidden="true" /></a>
              {source.publisherUrl && <a href={source.publisherUrl} target="_blank" rel="noreferrer">공식 게시글 · {source.posted}<ExternalLink size={12} aria-hidden="true" /></a>}
            </div>
          </div>;
        })}
      </details>
    </section>
  </div>;
}
