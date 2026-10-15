"use client";
import { useEffect, useState } from "react";
import { ExternalLink, FileText, Plus, Sparkles, X } from "lucide-react";
import type { Briefing, Research, ResearchEvidence } from "../lib/radar-types";
import ForecastValuation from "./forecast-valuation";

const kinds: Record<ResearchEvidence["kind"], string> = { ACTUAL: "회사 실적", GUIDANCE: "회사 가이던스", INDUSTRY_FORECAST: "업황 전망", BROKER_ESTIMATE: "증권사 추정" };
const blank = { publisher: "", title: "", published: "", period: "", kind: "BROKER_ESTIMATE", summary: "", url: "", product: "", value: "", unit: "조원" };
export default function ResearchPanel({ research, briefing, currentPrice, onSaved }: { research?: Research; briefing: Briefing | null; currentPrice: number | null; onSaved: () => void }) {
  const [filter, setFilter] = useState("ALL"), [canEdit, setCanEdit] = useState(false), [edit, setEdit] = useState(false);
  const [mode, setMode] = useState("EVIDENCE"), [form, setForm] = useState(blank), [verified, setVerified] = useState(false), [licensed, setLicensed] = useState(false);
  const [metrics, setMetrics] = useState([{ name: "연결 매출", value: "", unit: "조원" }, { name: "연결 영업이익", value: "", unit: "조원" }, { name: "목표주가", value: "", unit: "원/주" }]);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/research", { cache: "no-store" }).then((response) => response.json() as Promise<{ canEdit: boolean }>).then((data) => setCanEdit(data.canEdit === true)).catch(() => {}); }, []);
  useEffect(() => {
    if (!edit) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setEdit(false); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden"; window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [edit]);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const payload = mode === "MEMORY" ? { action: "MEMORY", publicationAllowed: licensed, quotes: [{ product: form.product, value: Number(form.value), unit: "USD/chip", observedAt: form.published, sourceUrl: form.url }] }
        : { action: "EVIDENCE", originalVerified: verified, publicationAllowed: licensed, evidence: { publisher: form.publisher, title: form.title, published: form.published, period: form.period, kind: form.kind, summary: form.summary, url: form.url, metrics: metrics.filter((item) => item.value.trim()) } };
      const response = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "저장 실패");
      setEdit(false); setForm(blank); setVerified(false); setLicensed(false); onSaved();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "저장 실패"); }
    finally { setBusy(false); }
  }
  const rows = (research?.evidence || []).filter((item) => filter === "ALL" || item.kind === filter);
  const brokers = research?.evidence.filter((item) => item.kind === "BROKER_ESTIMATE") || [];
  return <section className="research-section" id="research" aria-labelledby="researchTitle">
    <div className="section-heading"><h2 id="researchTitle"><FileText size={17} />하이닉스 업황·리포트</h2><div className="chart-controls"><span className="subtle">검증 원문 {research?.evidence.length || 0}건 · 증권사 {new Set(brokers.map((item) => item.publisher)).size}곳</span>{canEdit && <button className="icon-button" title="검증 자료 등록" aria-label="검증 자료 등록" onClick={() => setEdit(true)}><Plus size={16} /></button>}</div></div>
    <div className="memory-band"><div><h3>DRAM 현물가격</h3><p>{research?.memoryStatus || "승인된 현물가격 피드 확인 중"}</p><a href="https://www.dramexchange.com/" target="_blank" rel="noreferrer">DRAMeXchange 원문<ExternalLink size={11} /></a></div>
      {research?.memory.length ? research.memory.map((item) => <div key={item.product}><span>{item.product}</span><strong>${item.value.toLocaleString("ko-KR", { maximumFractionDigits: 3 })}<small>/chip</small></strong><p>{item.observedAt} 관측{Date.parse(research.checkedAt) - Date.parse(item.observedAt) > 5 * 86400000 ? " · 갱신 필요" : ""}</p><a href={item.sourceUrl} target="_blank" rel="noreferrer">출처<ExternalLink size={11} /></a></div>) : <div className="memory-unavailable"><strong>승인 피드 대기</strong><p>DDR4·DDR5 현물가는 사전 수집·공유 허락 확보 후 제공됩니다. 아래 계약가격 상승률 전망은 현물가나 HBM 가격이 아닙니다.</p><a href="https://www.trendforce.com/about/terms" target="_blank" rel="noreferrer">데이터 이용 조건<ExternalLink size={11} /></a></div>}
    </div>
    <ForecastValuation evidence={research?.evidence || []} currentPrice={currentPrice} />
    <div className="section-heading research-filter"><div className="segmented" aria-label="리포트 분류">{[["ALL", "전체"], ["BROKER_ESTIMATE", "증권사"], ["GUIDANCE", "가이던스"], ["INDUSTRY_FORECAST", "업황"], ["ACTUAL", "실적"]].map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)} aria-pressed={filter === id}>{label}</button>)}</div><span className="subtle">개별 추정치 · 시장 컨센서스 아님</span></div>
    <div className="table-scroll"><table className="research-table"><thead><tr><th>발표·분류</th><th>자료·대상 기간</th><th>수치·단위</th><th>검증 요약 / AI 해석</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}>
      <td><strong>{item.publisher}</strong><small>{item.published} · {kinds[item.kind]}</small><small>원문 확인 {item.verifiedAt}</small></td><td><a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink size={11} /></a><small>{item.period}</small></td>
      <td>{item.metrics.map((metric) => <div className="report-metric" key={metric.name}><span>{metric.name}</span><strong>{metric.value} <small>{metric.unit}</small></strong></div>)}</td>
      <td><p>{item.summary}</p>{briefing?.researchNotes?.find((note) => note.evidenceId === item.id) && <p className="news-insight"><Sparkles size={12} />{briefing.researchNotes.find((note) => note.evidenceId === item.id)?.note}</p>}</td>
    </tr>)}</tbody></table></div>
    {!rows.length && <p className="empty-feed">{research ? "해당 분류의 검증 자료가 없습니다." : "원문 자료 수집 중"}</p>}
    <p className="criteria-note">실적·회사 목표·산업 전망·증권사 추정은 서로 다른 자료입니다. 동일 기간·단위끼리 비교해야 하며 목표주가는 매수 신호가 아닙니다. 원문 확인 날짜는 최신 리포트라는 보증이 아닙니다.</p>
    {!!research?.discoveries.length && <details className="research-discoveries"><summary>새 리포트 탐색 · 제목 {research.discoveries.length}건 · 수치 검증 전</summary>{research.discoveries.map((item) => <a href={item.url.startsWith("https:") ? item.url : undefined} target="_blank" rel="noreferrer" key={item.id}><span>{item.title}</span><small>{item.source} · {new Date(item.published).toLocaleDateString("ko-KR")}</small><ExternalLink size={11} /></a>)}</details>}
    {edit && <div className="modal-backdrop" onClick={() => setEdit(false)}><section className="modal-panel research-editor" role="dialog" aria-modal="true" aria-labelledby="editorTitle" onClick={(event) => event.stopPropagation()}><div className="section-heading"><h2 id="editorTitle">검증 자료 등록</h2><button className="icon-button" onClick={() => setEdit(false)} title="닫기" aria-label="닫기" autoFocus><X size={18} /></button></div>
      <form onSubmit={save}><label>자료 종류<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="EVIDENCE">리포트 / 회사 발표</option><option value="MEMORY">승인 현물가격</option></select></label>
        {mode === "EVIDENCE" ? <><label>분류<select value={form.kind} onChange={(event) => update("kind", event.target.value)}>{Object.entries(kinds).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>발행처<input required maxLength={80} value={form.publisher} onChange={(event) => update("publisher", event.target.value)} /></label><label>제목<input required maxLength={180} value={form.title} onChange={(event) => update("title", event.target.value)} /></label><label>대상 기간<input required maxLength={60} value={form.period} onChange={(event) => update("period", event.target.value)} /></label></> : <><label>제품<input required maxLength={100} value={form.product} onChange={(event) => update("product", event.target.value)} /></label><label>가격 · USD/chip<input required type="number" step="any" min="0.001" value={form.value} onChange={(event) => update("value", event.target.value)} /></label></>}
        <label>{mode === "EVIDENCE" ? "발표일" : "관측일"}<input required type="date" value={form.published} onChange={(event) => update("published", event.target.value)} /></label><label>HTTPS 원문 주소<input required type="url" maxLength={2000} value={form.url} onChange={(event) => update("url", event.target.value)} /></label>
        {mode === "EVIDENCE" && <><label>검증 요약<textarea required maxLength={500} value={form.summary} onChange={(event) => update("summary", event.target.value)} /></label><fieldset><legend>수치 근거</legend>{metrics.map((metric, index) => <div className="metric-inputs" key={index}>{(["name", "value", "unit"] as const).map((key) => <input aria-label={`${index + 1} ${key === "name" ? "지표" : key === "value" ? "수치" : "단위"}`} maxLength={60} key={key} value={metric[key]} onChange={(event) => setMetrics((current) => current.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item))} />)}</div>)}</fieldset><label className="toggle"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />원문·발표일·기간·단위를 직접 검증했습니다</label></>}
        <label className="toggle"><input type="checkbox" checked={licensed} onChange={(event) => setLicensed(event.target.checked)} />이 자료의 공개 게시·재배포 권한을 확인했습니다</label>{message && <p role="alert" className="data-warning">{message}</p>}<button className="save-button" type="submit" disabled={busy || !licensed || (mode === "EVIDENCE" && !verified)}>{busy ? "저장 중" : "자료 등록"}</button>
      </form></section></div>}
  </section>;
}
