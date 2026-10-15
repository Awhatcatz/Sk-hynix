"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Bot, ChartCandlestick, Expand, MessageSquare, Radio, RefreshCw, RotateCcw, X } from "lucide-react";
import { ASSETS, type Snapshot } from "../lib/radar-types";
import { COUNCIL_ASSETS, type CouncilAssetId, type CouncilRun } from "../lib/council-contract";
import { effectiveTradePlan } from "../lib/trade-plan";
import MarketChart from "./market-chart";
import { periodCandles } from "../lib/chart-period";
import { useQuotes } from "./use-quotes";
import AiCouncil from "./ai-council";
import MasterDecision from "./master-decision";

const number = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "--" : value.toLocaleString("ko-KR", { maximumFractionDigits: digits });
const percent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "--" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const time = (value?: string | null) => !value ? "관측 대기" : new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const tone = (value?: number | null) => value == null ? "muted" : value >= 0 ? "positive" : "negative";

export default function RadarDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<CouncilAssetId>("hynix");
  const [run, setRun] = useState<CouncilRun | null>(null);
  const [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("3M"), [bollinger, setBollinger] = useState(true);
  const [averages, setAverages] = useState(true), [levels, setLevels] = useState(true);
  const [auto, setAuto] = useState(true), [expanded, setExpanded] = useState(false);
  const [resetKey, setResetKey] = useState(0), [now, setNow] = useState(Date.now());
  const polling = useRef(false);
  const quotes = useQuotes(auto);
  const asset = snapshot?.assets.find((item) => item.id === selected);
  const config = ASSETS.find((item) => item.id === selected)!;
  const quote = quotes.quoteFor(selected);
  const display = quote || asset;
  const selectedRun = run?.assetId === selected ? run : null;
  const plan = effectiveTradePlan(selectedRun?.tradePlan, now, quote || null);
  const visiblePlan = levels ? plan : undefined;
  const values = asset ? periodCandles(asset.candles, period) : [];
  const change = values.length && values[0].close > 0 ? (values.at(-1)!.close / values[0].close - 1) * 100 : null;

  const refreshMarkets = useCallback(async () => {
    if (polling.current) return;
    polling.current = true; setRefreshing(true);
    try {
      const response = await fetch("/api/markets", { cache: "no-store", signal: AbortSignal.timeout(45000) });
      const result = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(result.error || "차트 자료를 불러오지 못했습니다.");
      setSnapshot((current) => current?.generatedAt === result.generatedAt ? current : result); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "시세 연결 확인 필요"); }
    finally { polling.current = false; setRefreshing(false); }
  }, []);
  useEffect(() => { void refreshMarkets(); }, [refreshMarkets]);
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => { if (!document.hidden) void refreshMarkets(); }, 60000);
    return () => clearInterval(timer);
  }, [auto, refreshMarkets]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.body.style.overflow = "hidden"; window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", close); };
  }, [expanded]);
  const onRun = useCallback((next: CouncilRun | null) => setRun(next), []);

  const chartTools = <><div className="segmented" aria-label="차트 기간">{["1M", "3M", "6M", "1Y"].map((value) => <button key={value} aria-pressed={period === value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{value}</button>)}</div><button className="icon-button" title="차트 위치 초기화" aria-label="차트 위치 초기화" onClick={() => setResetKey((value) => value + 1)}><RotateCcw size={15} /></button></>;
  const chartOptions = <><label className="toggle"><input type="checkbox" checked={bollinger} onChange={(event) => setBollinger(event.target.checked)} />볼린저 밴드</label><label className="toggle"><input type="checkbox" checked={averages} onChange={(event) => setAverages(event.target.checked)} />이평선</label><label className="toggle"><input type="checkbox" checked={levels} onChange={(event) => setLevels(event.target.checked)} />캡틴 가격선</label></>;
  const chart = <section className="chart-section" id="market-chart" aria-label="시장 차트">
    <div className="section-heading"><div className="selected-title"><h2>{config.name}</h2><span>일봉</span></div><div className="chart-controls">{chartTools}<button className="icon-button" title="차트 확대" aria-label="차트 확대" onClick={() => setExpanded(true)}><Expand size={16} /></button></div></div>
    <div className="chart-price-row"><strong>{selected === "hynix" ? "₩" : selected === "bitcoin" ? "$" : ""}{number(display?.price, selected === "hynix" ? 0 : 2)}<small>{config.unit}</small></strong><span className={tone(display?.changePct)}>{percent(display?.changePct)}<small>{quote?.changeBasis === "ROLLING_24H" ? "24시간 대비" : "전일 대비"}</small></span></div>
    <div className="chart-subline"><span className={tone(change)}>{period} 변동 {percent(change)}</span><div className="chart-options">{chartOptions}</div></div>
    <MarketChart asset={asset} period={period} events={snapshot?.events || []} bollinger={bollinger} averages={averages} tradePlan={visiblePlan} resetKey={resetKey} />
    <div className="chart-caption"><div className="ma-legend">{averages && [[5, "#65d2a5"], [20, "#63b3ef"], [60, "#e3bc64"], [120, "#cf95bc"]].map(([days, color]) => <span key={days}><i style={{ background: String(color) }} />{days}일</span>)}</div><span>차트 기준 {asset?.candles.at(-1)?.time || "--"}</span></div>
    <div className="quote-context"><span className={`feed-label ${quote?.mode === "STREAM" && !quote.stale ? "positive" : ""}`}>{quote?.mode === "STREAM" && !quote.stale ? "LIVE · Coinbase 체결가" : quote?.source || asset?.source || "시세 연결 중"}</span><span>{time(display?.quoteTime)}{display?.quoteTime ? " KST" : ""}{display?.stale ? " · 최신성 확인 필요" : quote?.mode !== "STREAM" ? " · 지연 가능" : ""}</span></div>
    {selected === "bitcoin" && <small className="chart-feed-note">체결가 Coinbase · 일봉 Yahoo · 출처와 기준 시각이 다릅니다.</small>}
    {selectedRun && <MasterDecision run={selectedRun} quote={quote} />}
  </section>;

  return <main className="radar-shell studio-shell">
    <header className="topbar"><a className="brand" href="#ai-team"><Radio size={23} /><div><h1>Hynix Market Radar</h1><span>AI 시장 분석실</span></div></a><nav aria-label="메인 메뉴"><a href="#ai-team">분석실</a><a href="#market-chart">차트</a><a href="#ai-chat">캡틴과 대화</a></nav><div className="top-controls"><label className="toggle" title="시세 자동 갱신"><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} />시세 자동 갱신</label><button className="icon-button" disabled={refreshing} onClick={() => { void quotes.refresh(); void refreshMarkets(); }} title="시세 갱신" aria-label="시세 갱신"><RefreshCw size={16} className={refreshing ? "spinning" : ""} /></button></div></header>
    <div className="workspace">
      <div className="asset-strip" role="group" aria-label="분석 대상">{COUNCIL_ASSETS.map((id) => {
        const item = ASSETS.find((item) => item.id === id)!;
        const currentQuote = quotes.quoteFor(id);
        const current = currentQuote || snapshot?.assets.find((item) => item.id === id);
        return <button key={id} className={`asset-tile ${selected === id ? "selected" : ""}`} disabled={busy} aria-pressed={selected === id} onClick={() => setSelected(id)}>
          <span className="asset-tile-head">{item.name}{id === "bitcoin" && currentQuote?.mode === "STREAM" && !current?.stale && <i className="live-dot" />}</span><span className="asset-tile-price">{id === "hynix" ? "₩" : id === "bitcoin" ? "$" : ""}{number(current?.price, id === "hynix" ? 0 : 2)}</span><span className={`asset-change ${tone(current?.changePct)}`}>{current?.changePct != null && (current.changePct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />)}{percent(current?.changePct)}<small>{currentQuote?.changeBasis === "ROLLING_24H" ? "24시간 대비" : "전일 대비"}</small></span>
        </button>;
      })}</div>
      {error && <p className="status-notice" role="status">{error}</p>}
      <AiCouncil assetId={selected} chart={chart} onRun={onRun} onBusyChange={setBusy} quoteFor={quotes.quoteFor} />
      <footer><span>Hynix Market Radar</span><p>AI 조건부 판단 · 수익 보장 없음 · 자동 주문 없음</p><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Charts by TradingView</a></footer>
    </div>
    <nav className="mobile-studio-nav" aria-label="모바일 탐색"><a href="#ai-team"><Bot size={18} />분석실</a><a href="#market-chart"><ChartCandlestick size={18} />차트</a><a href="#ai-chat"><MessageSquare size={18} />캡틴과 대화</a></nav>
    {expanded && <div className="modal-backdrop" onClick={() => setExpanded(false)}><section className="modal-panel chart-modal-panel" role="dialog" aria-modal="true" aria-labelledby="modalTitle" onClick={(event) => event.stopPropagation()}><div className="section-heading"><h2 id="modalTitle">{config.name} 차트</h2><div className="chart-controls">{chartTools}<button className="icon-button" title="닫기" aria-label="닫기" autoFocus onClick={() => setExpanded(false)}><X size={18} /></button></div></div><div className="chart-options expanded-toggle">{chartOptions}</div><MarketChart asset={asset} period={period} events={snapshot?.events || []} expanded bollinger={bollinger} averages={averages} tradePlan={visiblePlan} resetKey={resetKey} /></section></div>}
  </main>;
}
