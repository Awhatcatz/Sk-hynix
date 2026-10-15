"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Clock3, ExternalLink, FileText, LoaderCircle, Play, RefreshCw, Sparkles, Square, TriangleAlert } from "lucide-react";
import { ASSETS, type Quote } from "../lib/radar-types";
import { ANALYSTS, ANALYST_DEADLINE_MS, STANCE_LABELS, nextAnalyst, type AnalystId, type CouncilAssetId, type CouncilRun, type CouncilUsage } from "../lib/council-contract";
import AiChat from "./ai-chat";
import PixelAnalyst from "./pixel-analyst";
import AnalystOffice from "./analyst-office";
import { effectiveTradePlan } from "../lib/trade-plan";
import "./ai-council.css";

type Envelope = { run?: CouncilRun; history?: CouncilRun[]; usage: CouncilUsage; error?: string };
const date = (value?: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "--";
const statusNames = { pending: "대기", running: "분석 중", done: "완료", error: "확인 필요" };
const runNames = { pending: "대기", running: "진행 중", complete: "완료", partial: "부분 완료", failed: "연결 확인" };

export default function AiCouncil({ assetId, chart, onRun, onBusyChange, quoteFor }: { assetId: CouncilAssetId; chart: ReactNode; onRun: (run: CouncilRun | null) => void; onBusyChange: (busy: boolean) => void; quoteFor: (id: CouncilAssetId) => Quote | undefined }) {
  const [run, setRun] = useState<CouncilRun | null>(null), [history, setHistory] = useState<CouncilRun[]>([]);
  const [usage, setUsage] = useState<CouncilUsage | null>(null), [actor, setActor] = useState<AnalystId>("master");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [message, setMessage] = useState("");
  const [working, setWorking] = useState<AnalystId | null>(null), [now, setNow] = useState(Date.now());
  const active = useRef(false), cancelled = useRef(false), controller = useRef<AbortController | null>(null);
  const latest = useRef<CouncilRun | null>(null);
  const assetName = ASSETS.find((item) => item.id === assetId)!.name;
  const record = run?.analysts.find((item) => item.id === actor), profile = ANALYSTS.find((item) => item.id === actor)!;
  const report = record?.report;
  const requested = run?.analysts.reduce((sum, item) => sum + item.attempts, 0) || 0;
  const tokens = run?.analysts.reduce((sum, item) => sum + (item.tokens?.total || 0), 0) || 0;

  const remember = useCallback((next: CouncilRun) => {
    latest.current = next;
    setRun(next); setHistory((previous) => [next, ...previous.filter((item) => item.id !== next.id)].slice(0, 12)); onRun(next);
  }, [onRun]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setRun(null); latest.current = null; onRun(null); setHistory([]); setMessage(""); setActor("master");
    fetch(`/api/council?asset=${assetId}`, { cache: "no-store", signal: abort.signal }).then(async (response) => {
      const data = await response.json() as Envelope;
      if (!response.ok) throw new Error(data.error || "기록 조회 실패");
      if (abort.signal.aborted) return;
      setUsage(data.usage); setHistory(data.history || []); setRun(data.history?.[0] || null); latest.current = data.history?.[0] || null;
      if (data.history?.[0]) onRun(data.history[0]);
    }).catch((cause) => { if (!abort.signal.aborted) setMessage(cause instanceof Error ? cause.message : "기록 연결 확인 필요"); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [assetId, onRun]);
  useEffect(() => () => { cancelled.current = true; controller.current?.abort(); }, []);
  const runningId = run?.analysts.find((item) => item.status === "running")?.id;
  useEffect(() => { onBusyChange(busy || !!runningId); }, [busy, runningId, onBusyChange]);
  const observingId = working || runningId;
  useEffect(() => {
    if (!working && !runningId) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [working, runningId]);
  useEffect(() => {
    if (!run || !observingId) return;
    const abort = new AbortController(), id = run.id;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/council?id=${id}`, { cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]) });
        const data = await response.json() as Envelope;
        if (response.ok && data.run && !abort.signal.aborted && latest.current?.id === id && data.run.updatedAt >= latest.current.updatedAt) { remember(data.run); setUsage(data.usage); }
      } catch { /* Read-only polling never retries a paid analysis request. */ }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 3000);
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { abort.abort(); clearTimeout(timer); };
  }, [run?.id, observingId, remember]);

  async function read(id: string, signal?: AbortSignal) {
    const response = await fetch(`/api/council?id=${id}`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
    const data = await response.json() as Envelope;
    if (!response.ok || !data.run) throw new Error(data.error || "기록 조회 실패");
    remember(data.run); setUsage(data.usage); return data.run;
  }
  async function awaitStored(id: string, actorId: AnalystId, signal: AbortSignal) {
    const deadline = Date.now() + ANALYST_DEADLINE_MS + 15000;
    while (!signal.aborted) {
      const current = await read(id, signal);
      const actor = current.analysts.find((item) => item.id === actorId)!;
      if (actor.status !== "running") return current;
      if (Date.now() > deadline) throw new Error("저장된 응답을 확인하지 못했습니다. 자동 재호출하지 않았습니다.");
      await new Promise<void>((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error("STOPPED");
  }

  async function request(body: object, abort: AbortController) {
    const response = await fetch("/api/council", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(140000)]) });
    const data = await response.json() as Envelope;
    if (!response.ok || !data.run) throw new Error(data.error || "분석 연결 확인 필요");
    setUsage(data.usage); remember(data.run); return data.run;
  }
  async function analyze(mode: "new" | "resume" | "retry") {
    if (active.current) return;
    active.current = true; cancelled.current = false; setBusy(true); setMessage("");
    const abort = new AbortController(); controller.current = abort;
    try {
      let current = mode === "new" ? await request({ action: "start", assetId, requestId: crypto.randomUUID() }, abort)
        : mode === "retry" && run ? await request({ action: "retry", runId: run.id }, abort) : run;
      if (!current) return;
      while (!cancelled.current && nextAnalyst(current)) {
        const next = nextAnalyst(current)!; setActor(next.id);
        setWorking(next.id); setNow(Date.now());
        if (next.status === "running") current = await awaitStored(current.id, next.id, abort.signal);
        else {
          try { current = await request({ action: "step", runId: current.id, analystId: next.id }, abort); }
          catch (cause) {
            if (abort.signal.aborted) throw cause;
            setMessage("응답 연결이 끊겨 저장된 상태를 확인 중입니다. 모델을 다시 호출하지 않습니다.");
            current = await awaitStored(current.id, next.id, abort.signal);
            if (current.analysts.find((item) => item.id === next.id)?.status === "pending") throw new Error("요청 전송을 확인하지 못했습니다. 이어서 분석을 눌러 다시 시도하세요.");
          }
          if (current.analysts.find((item) => item.id === next.id)?.status === "running") current = await awaitStored(current.id, next.id, abort.signal);
        }
        setWorking(null);
      }
      if (!cancelled.current && !nextAnalyst(current)) {
        setActor("master"); setMessage(current.status === "complete" ? "네 전문가와 마스터의 기록을 저장했습니다." : "일부 모델의 분석을 확인하지 못했습니다. 완료된 기록만 표시합니다.");
      }
    } catch (cause) {
      if (latest.current) { try { await read(latest.current.id); } catch { /* Preserve the last server-confirmed report. */ } }
      setMessage(abort.signal.aborted ? "다음 분석 요청을 중단했습니다. 이미 전송된 요청에는 비용이 발생할 수 있습니다." : cause instanceof Error ? cause.message : "분석 연결 확인 필요");
    } finally { active.current = false; controller.current = null; setWorking(null); setBusy(false); }
  }
  async function reload() {
    if (!run || busy) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/council?id=${run.id}`, { cache: "no-store" }); const data = await response.json() as Envelope;
      if (!response.ok || !data.run) throw new Error(data.error || "기록 조회 실패");
      remember(data.run); setUsage(data.usage); setMessage("");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "기록 조회 실패"); }
    finally { setLoading(false); }
  }
  return <section className="council-section" id="ai-team" aria-labelledby="councilTitle">
    <div className="council-heading"><div><h2 id="councilTitle">{assetName} 분석실</h2><span className="council-progress" role="status">{loading ? "기록 조회 중" : busy || runningId ? `${run?.analysts.filter((item) => item.status === "done").length || 0}/5 보고 완료` : run ? `최근 보고 ${date(run.createdAt)} KST` : "분석팀 대기"}</span></div>
      <div className="council-command">
        <button className="analysis-button" onClick={() => void analyze("new")} disabled={busy || loading} aria-busy={busy}><Sparkles size={15} />{busy ? "분석 중" : "AI 분석"}</button>
        {busy && <button className="icon-button" aria-label="분석 중단" title="다음 분석 요청 중단" onClick={() => { cancelled.current = true; controller.current?.abort(); }}><Square size={15} /></button>}
      </div>
    </div>
    <div className="council-workbench"><div className="office-column">
    <AnalystOffice run={run} decision={run ? effectiveTradePlan(run.tradePlan, Date.now(), quoteFor(run.assetId) || null)?.action : undefined} selected={actor} working={working} onSelect={setActor} />
    <div className="analyst-roster" role="tablist" aria-label="분석가 기록">{ANALYSTS.map((item, index) => {
      const entry = run?.analysts.find((entry) => entry.id === item.id); const status = entry?.status || "pending";
      return <button key={item.id} role="tab" id={`analyst-${item.id}`} aria-selected={actor === item.id} aria-controls="analyst-report" tabIndex={actor === item.id ? 0 : -1} title={item.title} className={`analyst-card ${actor === item.id ? "active" : ""}`} onClick={() => setActor(item.id)} onKeyDown={(event) => { const next = event.key === "ArrowRight" ? (index + 1) % ANALYSTS.length : event.key === "ArrowLeft" ? (index + ANALYSTS.length - 1) % ANALYSTS.length : event.key === "Home" ? 0 : event.key === "End" ? ANALYSTS.length - 1 : null; if (next !== null) { event.preventDefault(); setActor(ANALYSTS[next].id); document.getElementById(`analyst-${ANALYSTS[next].id}`)?.focus(); } }} style={{ "--analyst-color": item.color } as React.CSSProperties}>
        <PixelAnalyst index={item.sprite} id={item.id} working={status === "running" || working === item.id} /><span className="analyst-name">{item.name}</span><span className="analyst-role">{["밴드", "추세", "실적·뉴스", "위험", "종합"][index]}</span>
        <span className={`analyst-state ${status}`}>{status === "done" ? <Check size={12} /> : status === "error" ? <TriangleAlert size={12} /> : status === "running" || working === item.id ? <LoaderCircle size={12} className="spinning" /> : <Clock3 size={12} />}{working === item.id && status === "pending" ? "요청 중" : statusNames[status]}{status === "running" && entry?.startedAt ? ` · ${Math.max(0, Math.floor((now - Date.parse(entry.startedAt)) / 1000))}초` : ""}</span>
      </button>;
    })}</div>
    {message && <p className="analysis-notice" role="status">{message}</p>}
    <div className="council-recordbar"><label><FileText size={14} />분석 기록<select aria-label="분석 기록" value={run?.id || ""} disabled={busy || loading || !history.length} onChange={(event) => { const found = history.find((item) => item.id === event.target.value); if (found) { remember(found); setActor("master"); setMessage(""); } }}><option value="" disabled>저장된 기록 없음</option>{history.map((item) => <option key={item.id} value={item.id}>{date(item.createdAt)} KST · {item.assetName} · {runNames[item.status]}</option>)}</select></label>
      <div className="council-record-actions">{run && <><span>{requested}회 호출{tokens ? ` · ${tokens.toLocaleString()} 토큰` : ""}</span><button className="icon-button" title="저장된 기록 새로 조회" aria-label="분석 기록 조회" disabled={busy || loading} onClick={() => void reload()}><RefreshCw size={14} /></button></>}{run && nextAnalyst(run) && !busy && <button className="analysis-button secondary" onClick={() => void analyze("resume")} disabled={loading}><Play size={13} />이어서 분석</button>}{run && !nextAnalyst(run) && run.analysts.some((item) => item.status === "error") && <button className="analysis-button secondary" onClick={() => void analyze("retry")} disabled={busy || loading}><RefreshCw size={13} />실패한 분석 재시도</button>}</div>
    </div>
    {run && nextAnalyst(run) && !runningId && !busy && run.analysts.some((item) => item.status === "error") && <button className="analysis-button secondary" disabled={loading} onClick={() => void analyze("retry")}><RefreshCw size={13} />중단된 분석 재시도</button>}
    <article className="analyst-report" id="analyst-report" role="tabpanel" aria-labelledby={`analyst-${actor}`}>
      <div className="report-title"><h3>{profile.name}의 {actor === "master" ? "최종 브리핑" : "분석 기록"}</h3>{report && <span className={`report-stance ${report.stance.toLowerCase()}`}>{STANCE_LABELS[report.stance]}</span>}</div>
      {report ? <><h4>{report.headline}</h4><p className="report-lesson">{report.lesson || report.summary}</p>
        <details className="report-detail" key={`${run?.id}:${actor}`}><summary>상세 보고서 · 판단 근거</summary><p className="report-summary">{report.summary}</p>
        <div className="report-columns"><div><h5>확인한 근거</h5><ul className="report-findings">{report.findings.map((item, index) => { const source = run?.sources.find((source) => source.id === item.sourceId); return <li key={index}><p>{item.observation}</p>{source && <a href={source.url} target="_blank" rel="noreferrer">{source.title} · {source.date?.slice(0, 10) || "관측일 미확인"}<ExternalLink size={11} /></a>}</li>; })}</ul></div>
          <div className="report-conditions"><h5>상승을 확인할 조건</h5><p>{report.upsideCondition || "확인 가능한 조건 없음"}</p><h5>하락 위험을 확인할 조건</h5><p>{report.downsideCondition || "확인 가능한 조건 없음"}</p><h5>쉽게 말하면</h5><p>{report.lesson}</p></div></div>
        {actor === "master" && <div className="report-comparison">{[["공통 의견", report.agreements], ["의견 차이", report.disagreements], ["다음 확인", report.watchpoints]].map(([title, items]) => <div key={String(title)}><h5>{String(title)}</h5><ul>{(items as string[]).map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</div>}
        <p className="report-caution"><TriangleAlert size={13} />{report.caution}</p></details><p className="report-caution"><TriangleAlert size={13} />AI 판단은 참고용이며 손실이 발생할 수 있습니다.</p><small className="report-completed">{record?.model} · 기록 완료 {date(record?.completedAt)} KST</small>
      </> : <div className="report-empty">{record?.error ? <><TriangleAlert size={23} /><p>{record.error}</p></> : record?.status === "running" || working === actor ? <><PixelAnalyst index={profile.sprite} id={actor} working /><p>{profile.name} · {profile.title}<br />{record?.status === "running" ? "제공된 시장 자료 분석 중" : "모델에 분석 요청 전송 중"}</p></> : <><FileText size={23} /><p>{loading ? "저장된 분석 기록 조회 중" : run ? "아직 이 분석가의 기록이 없습니다." : "아직 생성된 분석 기록이 없습니다."}</p></>}</div>}
    </article>
    </div><div className="chart-column">{chart}
    <AiChat key={run ? `${run.id}:${run.analysts.find((item) => item.id === "master")?.completedAt || "pending"}` : assetId} assetId={assetId} assetName={assetName} run={run} onUsage={setUsage} />
    </div></div>
    {run && <details className="council-audit"><summary>자료 시각 · 분석 진행 기록 · 출처</summary><p>시세 조회 {date(run.quoteAsOf)} KST · 확정 일봉 {run.dailyBarTime || "없음"} · {run.stale ? "최신성 확인 필요" : "최신성 검사 통과"} · 최근 12건 표시, 이전 기록은 서버에 보존</p><ol>{run.analysts.map((item) => <li key={item.id}><strong>{ANALYSTS.find((actor) => actor.id === item.id)!.title}</strong><span>{statusNames[item.status]} · {item.attempts}회 요청 · {item.startedAt ? date(item.startedAt) + " KST" : "미전송"}</span></li>)}</ol><div>{run.sources.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer">{item.title} · {item.date?.slice(0, 10) || "관측일 미확인"}<ExternalLink size={11} /></a>)}</div>{run.warnings.map((item, index) => <p className="data-warning" key={index}>{item}</p>)}</details>}
    <details className="council-usage"><summary>AI 사용 기록</summary><p className="analysis-usage">{usage ? `${usage.day} KST · ${usage.totalCalls.toLocaleString()}회 (분석 ${usage.analysisCalls.toLocaleString()} · 대화 ${usage.chatCalls.toLocaleString()})` : "사용 기록 조회 중"} · 횟수 제한 없음</p><p>새 분석 최대 5회 호출 · 수동 실행 · 이미 전송한 요청에는 중단해도 제공처 비용이 발생할 수 있습니다.</p></details>
  </section>;
}
