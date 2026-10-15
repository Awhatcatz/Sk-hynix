"use client";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, MessageSquare, Send, Square, Trash2 } from "lucide-react";
import type { ChatMessage } from "../lib/chat-input";
import { ANALYSTS, type CouncilAssetId, type CouncilRun, type CouncilUsage } from "../lib/council-contract";
import PixelAnalyst from "./pixel-analyst";

type Reply = { reply: string; model: string; asOf: string; sources: { title: string; url: string }[]; usage?: CouncilUsage };
export default function AiChat({ run, assetId = "hynix", assetName = "SK하이닉스", onUsage }: { run: CouncilRun | null; assetId?: CouncilAssetId; assetName?: string; onUsage?: (usage: CouncilUsage) => void }) {
  const master = run?.analysts.find((item) => item.id === "master"), profile = ANALYSTS.find((item) => item.id === "master")!;
  const ready = master?.status === "done" && !!master.report;
  const [messages, setMessages] = useState<ChatMessage[]>([]), [input, setInput] = useState("");
  const [busy, setBusy] = useState(false), [pending, setPending] = useState(""), [error, setError] = useState("");
  const [meta, setMeta] = useState<Reply | null>(null);
  const controller = useRef<AbortController | null>(null), log = useRef<HTMLDivElement>(null), draft = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => () => controller.current?.abort(), []);
  async function send(event: React.FormEvent) {
    event.preventDefault(); const question = input.trim(); if (!question || busy || !ready) return;
    setBusy(true); setError(""); setPending(question);
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 110000);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ analysisRunId: run!.id, assetId, messages: [...messages.slice(-10).map((item) => ({ ...item, content: item.content.slice(0, 3000) })), { role: "user", content: question }] }) });
      const data = await response.json() as Reply & { error?: string };
      if (!response.ok) throw new Error(data.error || "답변 생성 실패");
      if (data.usage) onUsage?.(data.usage);
      setMessages((current) => [...current, { role: "user", content: question }, { role: "assistant", content: data.reply }]); setMeta(data); setInput("");
    } catch (cause) { setError(abort.signal.aborted ? "대화를 중단했습니다. 다시 전송할 수 있습니다." : cause instanceof Error ? cause.message : "연결 확인 필요"); }
    finally { clearTimeout(timeout); setBusy(false); setPending(""); controller.current = null; }
  }
  return <section className="chat-section" id="ai-chat" aria-labelledby="chatTitle"><div className="section-heading"><div className="master-chat-heading"><PixelAnalyst index={profile.sprite} id="master" working={busy} /><div><h2 id="chatTitle"><MessageSquare size={17} />캡틴과 대화</h2><span className="subtle">{assetName} · {ready ? "최종 브리핑 연결됨" : "최종 브리핑 대기"}</span></div></div><button className="icon-button" disabled={busy || !messages.length} onClick={() => { setMessages([]); setMeta(null); setError(""); }} title="대화 지우기" aria-label="대화 지우기"><Trash2 size={16} /></button></div>
    {ready && <div className="master-chat-briefing"><strong>{master.report!.headline}</strong><p>{master.report!.lesson || master.report!.summary}</p><details><summary>전체 브리핑</summary><p>{master.report!.summary}</p></details><small>선택한 기록 · {new Date(run!.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST</small></div>}
    <div className="chat-log" ref={log} role="log" aria-live="polite" aria-relevant="additions">{!ready && <div className="chat-intro">{run ? "캡틴의 최종 보고를 기다리고 있어요." : "아직 완료된 브리핑이 없어요."}</div>}{messages.map((item, index) => <article className={`chat-message ${item.role}`} key={index}><strong>{item.role === "user" ? "나" : "캡틴 · 마스터"}</strong><p>{item.content}</p></article>)}{busy && <><article className="chat-message user"><strong>나</strong><p>{pending}</p></article><p className="chat-pending" role="status">캡틴이 전문가 기록과 최신 자료를 확인 중입니다.</p></>}</div>
    <div className="chat-questions" aria-label="추천 질문">{[["매수 조건은?", "현재 브리핑에서 매수를 검토할 가격과 추가 확인 조건을 쉽게 설명해줘. 유효하지 않은 조건이면 보류 이유도 알려줘."], ["틀릴 위험은?", "이 판단이 틀릴 수 있는 가장 중요한 위험과 시나리오가 무효가 되는 조건을 알려줘."], ["쉽게 설명해줘", "전문가들의 공통 의견과 의견 차이를 고등학생도 이해할 수 있게 쉽게 설명해줘."]].map(([label, question]) => <button type="button" key={label} disabled={!ready || busy} onClick={() => { setInput(question); draft.current?.focus(); }}>{label}</button>)}</div>
    {meta && <details className="chat-sources"><summary>참고 자료 · {new Date(meta.asOf).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST 조회</summary>{meta.sources.map((item) => <a key={item.title} href={item.url.startsWith("https:") ? item.url : undefined} target="_blank" rel="noreferrer">{item.title}<ExternalLink size={11} /></a>)}</details>}
    {error && <p className="data-warning" role="alert">{error}</p>}
    <form className="chat-compose" onSubmit={send}><textarea ref={draft} aria-label="AI에게 질문" maxLength={3000} rows={2} value={input} onChange={(event) => setInput(event.target.value)} placeholder={ready ? "캡틴, 지금 판단에서 궁금한 건…" : "마스터 브리핑 대기"} disabled={busy || !ready} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="icon-button" type={busy ? "button" : "submit"} disabled={!busy && (!ready || !input.trim())} onClick={busy ? () => controller.current?.abort() : undefined} title={busy ? "답변 중단" : "질문 전송"} aria-label={busy ? "답변 중단" : "질문 전송"}>{busy ? <Square size={17} /> : <Send size={17} />}</button></form>
    <p className="chat-privacy">Baze AI로 전송 · 대화는 사이트 서버에 저장하지 않음 · 개인정보 입력 금지</p>
  </section>;
}
