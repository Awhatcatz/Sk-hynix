"use client";
import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { ANALYSTS, type AnalystId, type CouncilRun } from "../lib/council-contract";

type Point = { x: number; y: number };
type Delivery = { id: AnalystId; start: number };
const tasks = ["밴드 관측", "추세 비교", "자료 검토", "위험 점검", "종합 판단"];
const states = { pending: "대기", running: "분석 중", done: "보고 완료", error: "연결 확인" };
const duration = 11000;

function along(points: Point[], progress: number): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let distance = Math.max(0, Math.min(1, progress)) * lengths.reduce((sum, n) => sum + n, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i]) { const t = lengths[i] ? distance / lengths[i] : 1; return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t }; }
    distance -= lengths[i];
  }
  return points.at(-1)!;
}

export default function AnalystOffice({ run, decision, selected, working, onSelect }: { run: CouncilRun | null; decision?: "BUY" | "HOLD" | "SELL"; selected: AnalystId; working: AnalystId | null; onSelect: (id: AnalystId) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef({ run, decision, selected, working, onSelect }); input.current = { run, decision, selected, working, onSelect };
  const previous = useRef<{ id: string; completed: Set<string> } | null>(null);
  const deliveries = useRef<Delivery[]>([]), presentation = useRef(0), hitboxes = useRef<{ id: AnalystId; x: number; y: number }[]>([]);
  const replayStart = useRef<number | null>(null), repaint = useRef<() => void>(() => {});
  const [replaying, setReplaying] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => { const media = matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReducedMotion(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const canReplay = !!run?.analysts.some((actor) => actor.status === "done") && !working && !run.analysts.some((actor) => actor.status === "running");
  useEffect(() => {
    if (!run) { previous.current = null; deliveries.current = []; replayStart.current = null; setReplaying(false); repaint.current(); return; }
    const completed = new Set(run.analysts.filter((actor) => actor.status === "done").map((actor) => `${actor.id}:${actor.completedAt}`));
    if (previous.current?.id === run.id) {
      for (const actor of run.analysts) if (actor.status === "done" && !previous.current.completed.has(`${actor.id}:${actor.completedAt}`)) {
        const nextSlot = Math.max(performance.now(), (deliveries.current.at(-1)?.start || 0) + (deliveries.current.length ? duration : 0));
        if (actor.id === "master") presentation.current = nextSlot;
        else deliveries.current.push({ id: actor.id, start: nextSlot });
      }
    } else { deliveries.current = []; presentation.current = 0; replayStart.current = null; setReplaying(false); }
    previous.current = { id: run.id, completed };
    repaint.current();
  }, [run]);

  useEffect(() => {
    const node = canvas.current!, ctx = node.getContext("2d");
    if (!ctx) return;
    const atlas = new Image(), backdrop = new Image();
    atlas.src = "/characters/analyst-team.png"; backdrop.src = "/characters/analyst-office-v1.png";
    let raf = 0, disposed = false, visible = true, lastFrame = 0;
    let width = 960, height = 560, scale = 1;
    const block = (x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    const text = (label: string, x: number, y: number, color = "#f1f4f5", size = 12) => {
      ctx.font = `600 ${size}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = color; ctx.fillText(label, x, y);
    };
    const paper = (x: number, y: number, color: string, stamp = false) => {
      block(x + 2, y + 3, 19, 24, "#303639"); block(x, y, 19, 24, "#edf2ed");
      for (let i = 0; i < 3; i++) block(x + 4, y + 5 + i * 5, 10 - i, 2, "#87979b");
      if (stamp) { block(x + 10, y + 14, 6, 6, color); block(x + 11, y + 15, 2, 2, "#edf2ed"); }
    };
    const monitor = (x: number, y: number, index: number, active: boolean, time: number) => {
      const color = ANALYSTS[index].color;
      block(x, y, 67, 43, "#172025"); block(x + 4, y + 4, 59, 34, "#263337"); block(x + 29, y + 43, 10, 8, "#9cadb0"); block(x + 18, y + 50, 32, 4, "#b8c6c5");
      const tick = active ? Math.floor(time / 220) : 0;
      if (index < 2) {
        for (let i = 0; i < 11; i++) { const h = 6 + ((i * 7 + tick) % 20); block(x + 8 + i * 4, y + 31 - h, 2, h, color); }
        ctx.lineWidth = 2; ctx.strokeStyle = index === 0 ? "#ead084" : "#efaa91";
        for (let band = 0; band < (index === 0 ? 2 : 1); band++) {
          ctx.beginPath(); for (let i = 0; i < 48; i++) { const px = x + 8 + i, py = y + 12 + band * 13 + 3 * Math.sin((i + tick) / 9); if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke();
        }
      } else if (index === 4) {
        for (let i = 0; i < 4; i++) { block(x + 9 + (i % 2) * 25, y + 9 + Math.floor(i / 2) * 13, 19, 8, ANALYSTS[i].color); if (active && tick % 4 === i) block(x + 10 + (i % 2) * 25, y + 10 + Math.floor(i / 2) * 13, 17, 2, "#f4f6ef"); }
      } else {
        for (let i = 0; i < 5; i++) { block(x + 9, y + 9 + i * 5, 4, 3, color); block(x + 17, y + 9 + i * 5, 28 - ((i + tick) % 3) * 5, 2, "#c6d7d6"); }
        if (active) block(x + 47, y + 9 + (tick % 5) * 5, 6, 3, "#ead084");
      }
    };
    const draw = (time: number) => {
      const data = input.current, compact = width === 440;
      ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.imageSmoothingEnabled = false;
      block(0, 0, width, height, "#4b5054");
      if (backdrop.complete && backdrop.naturalWidth) ctx.drawImage(backdrop, 0, 0, width, height);
      const desks: Point[] = compact ? [{ x: 82, y: 270 }, { x: 230, y: 270 }, { x: 82, y: 462 }, { x: 230, y: 462 }, { x: 365, y: 362 }]
        : [{ x: 143, y: 257 }, { x: 390, y: 257 }, { x: 143, y: 419 }, { x: 390, y: 419 }, { x: 787, y: 327 }];
      const captain = desks[4], size = compact ? 67 : 84;
      const replayTime = replayStart.current === null ? null : time - replayStart.current;
      const reports = data.run?.analysts.filter((a) => a.id !== "master" && a.status === "done") || [];
      const maxReplay = reports.length * duration;
      if (replayTime !== null && replayTime > maxReplay + 6500) { replayStart.current = null; setReplaying(false); }
      deliveries.current = deliveries.current.filter((delivery) => time - delivery.start < duration);
      const replayDeliveries = replayTime === null ? [] : reports.map((a, i) => ({ id: a.id, start: replayStart.current! + i * duration }));
      const moving = [...deliveries.current, ...replayDeliveries];
      const actors: { index: number; pos: Point; carrying: boolean; working: boolean; walking: boolean; delivering: boolean }[] = [];
      hitboxes.current = [];
      for (const [i, profile] of ANALYSTS.entries()) {
        const desk = desks[i], actor = data.run?.analysts.find((a) => a.id === profile.id), active = actor?.status === "running" || data.working === profile.id;
        const delivery = moving.findLast((d) => d.id === profile.id && time >= d.start && time - d.start < duration);
        const delta = delivery ? time - delivery.start : 0;
        const path = [{ x: desk.x - 24, y: desk.y }, { x: desk.x - 24, y: desk.y + 57 }, { x: compact ? 300 : 576, y: desk.y + 57 }, { x: compact ? 300 : 576, y: captain.y + 57 }, { x: captain.x - 50, y: captain.y + 45 }];
        let pos = { x: desk.x - 24, y: desk.y };
        const walking = !!delivery && (delta < 4000 || delta >= 6000);
        if (delivery) pos = along(path, delta < 4000 ? delta / 4000 : delta < 6000 ? 1 : 1 - (delta - 6000) / 5000);
        const isMasterPresenting = i === 4 && (replayTime !== null && replayTime > maxReplay || presentation.current > 0 && time >= presentation.current && time - presentation.current < 9000);
        if (isMasterPresenting) pos = { x: captain.x - (compact ? 37 : 100), y: captain.y - (compact ? 18 : 30) };
        actors.push({ index: i, pos, carrying: !!delivery && delta < 6000, working: active, walking, delivering: !!delivery && delta >= 4000 && delta < 6000 });
        block(desk.x - (compact ? 57 : 75), desk.y + 24, compact ? 115 : 150, 34, "#263034");
        block(desk.x - (compact ? 55 : 73), desk.y + 24, compact ? 111 : 146, 7, profile.color);
        block(desk.x - 48, desk.y + 58, 8, 20, "#252d30"); block(desk.x + 42, desk.y + 58, 8, 20, "#252d30");
        block(desk.x - 47, desk.y - 38, 45, 37, "#334144"); block(desk.x - 44, desk.y - 35, 39, 3, profile.color);
        monitor(desk.x + (compact ? -3 : 14), desk.y - 36, i, active, time);
        block(desk.x - 37, desk.y + 28, 35, 8, "#d2dfda");
        for (let key = 0; key < 7; key++) block(desk.x - 34 + key * 4, desk.y + 30, 2, 2, "#526b6b");
        const screenState = actor?.status || "pending";
        block(desk.x - (compact ? 56 : 73), desk.y + 88, compact ? 112 : 146, 37, "#20292ded");
        text(`${profile.name} · ${tasks[i]}`, desk.x, desk.y + 103, profile.color, compact ? 11 : 12);
        text(states[screenState], desk.x, desk.y + 117, screenState === "error" ? "#efaa91" : "#d0dada", 10);
        if (actor?.status === "error") { block(desk.x - 63, desk.y - 40, 19, 20, "#5b3030"); text("!", desk.x - 53, desk.y - 25, "#efaa91", 16); }
        if (active && i === 2) {
          const cycle = (time % 2200) / 2200; paper(desk.x - 53, desk.y + 12 + cycle * 15, profile.color);
          block(desk.x - 57, desk.y + 15, 28, 6, "#90a4a6");
        }
      }
      actors.sort((a, b) => a.pos.y - b.pos.y);
      for (const a of actors) {
        const profile = ANALYSTS[a.index], x = Math.round(a.pos.x), y = Math.round(a.pos.y);
        const step = a.walking ? Math.floor(time / 140) % 2 : 0;
        block(x - size / 3, y + 8, size * .66, 8, "#252b2e75");
        if (data.selected === profile.id) { ctx.strokeStyle = profile.color; ctx.lineWidth = 2; ctx.strokeRect(x - size / 2 + 3, y - size + 10, size - 6, size + 6); }
        if (atlas.complete && atlas.naturalWidth) ctx.drawImage(atlas, profile.sprite * atlas.naturalWidth / 5, 0, atlas.naturalWidth / 5, atlas.naturalHeight, x - size / 2, y - size + 12 - step * 3, size, size);
        if (a.working && !a.walking) {
          const hand = Math.floor(time / 170) % 2;
          block(x - 19, y + 3 + hand * 3, 11, 7, profile.color); block(x + 10, y + 6 - hand * 3, 11, 7, profile.color);
          for (let k = 0; k < 3; k++) block(x - 9 + k * 7, y - size - 4, 4, 4, (Math.floor(time / 250) + k) % 3 ? profile.color : "#f1f4eb");
          if (a.index === 3) { paper(x - 40, y + 4, profile.color, Math.floor(time / 1000) % 2 === 0); block(x - 36, y + 1 + hand * 4, 15, 5, profile.color); }
          if (a.index === 4) for (let k = 0; k < reports.length; k++) { const offset = (time / 900 + k * .8) % 1; paper(x - 43 + offset * 32, y + 4 - offset * 25, ANALYSTS[k].color); }
        }
        if (a.walking) { block(x - 18, y + 7 + step * 3, 12, 4, profile.color); block(x + 8, y + 10 - step * 3, 12, 4, profile.color); }
        if (a.carrying) paper(x + 18, y - 22, profile.color, true);
        if (a.delivering) { block(x - 40, y - size - 20, 80, 21, "#20292d"); text("보고서 전달", x, y - size - 5, profile.color, 11); }
        hitboxes.current.push({ id: profile.id, x: x / width, y: (y - size / 2 + 12) / height });
      }
      for (let i = 0; i < reports.length; i++) paper(captain.x - 66 + i * 6, captain.y + 19 - i * 3, ANALYSTS.find((a) => a.id === reports[i].id)!.color, true);
      const masterDone = data.run?.analysts.find((a) => a.id === "master")?.status === "done";
      const decision = data.decision;
      const boardX = compact ? 270 : 654, boardY = compact ? 199 : 154, boardW = compact ? 159 : 253;
      block(boardX, boardY, boardW, 57, "#232e32"); block(boardX, boardY, boardW, 3, "#ead084");
      text(masterDone ? decision === "BUY" ? "캡틴 · 조건부 매수" : decision === "SELL" ? "캡틴 · 조건부 매도" : decision === "HOLD" ? "캡틴 · 보류" : "캡틴 · 보고 완료" : "캡틴의 종합 브리핑", boardX + boardW / 2, boardY + 24, "#ead084", compact ? 11 : 14);
      text(`${reports.length} / 4 전문가 보고서`, boardX + boardW / 2, boardY + 43, "#c9d8d7", 11);
      const titleX = compact ? 158 : 266;
      block(compact ? 34 : 88, compact ? 195 : 163, compact ? 226 : 355, 28, "#232e32ed");
      text(data.run?.assetName || "시장 분석 사무실", titleX, compact ? 214 : 182, "#f0f6f2", compact ? 12 : 14);
      node.dataset.motion = replayTime !== null ? "replay" : actors.some((a) => a.walking || a.working || a.delivering) ? "working" : "idle";
      node.dataset.deliveries = String(moving.filter((d) => time >= d.start && time - d.start < duration).length);
      node.dataset.ready = String(backdrop.complete && backdrop.naturalWidth > 0 && atlas.complete && atlas.naturalWidth > 0);
    };
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const frame = (time: number) => {
      raf = 0;
      if (disposed || !visible || document.hidden) return;
      if (time - lastFrame >= 1000 / 24 || media.matches) { draw(media.matches ? 0 : time); lastFrame = time; }
      if (!media.matches && (input.current.working || input.current.run?.analysts.some((a) => a.status === "running") || deliveries.current.length || replayStart.current !== null || presentation.current > 0 && time - presentation.current < 9000)) raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (disposed) return; if (raf) cancelAnimationFrame(raf); lastFrame = 0; raf = requestAnimationFrame(frame); };
    repaint.current = wake;
    const resize = () => {
      const bounds = node.getBoundingClientRect(); if (!bounds.width) return;
      width = bounds.width < 440 ? 440 : 960; height = width === 440 ? 610 : 560;
      scale = bounds.width / width * Math.min(devicePixelRatio || 1, 2);
      const pixelsW = Math.round(width * scale), pixelsH = Math.round(height * scale);
      if (node.width !== pixelsW) node.width = pixelsW;
      if (node.height !== pixelsH) node.height = pixelsH;
      draw(media.matches ? 0 : performance.now()); wake();
    };
    const observer = new ResizeObserver(resize); observer.observe(node);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); }); intersection.observe(node);
    atlas.onload = backdrop.onload = wake; atlas.onerror = backdrop.onerror = () => { if (!disposed) setArtFailed(true); };
    document.addEventListener("visibilitychange", wake); media.addEventListener("change", wake); resize();
    return () => { disposed = true; cancelAnimationFrame(raf); observer.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", wake); media.removeEventListener("change", wake); repaint.current = () => {}; };
  }, []);
  useEffect(() => { repaint.current(); }, [selected, working, decision]);
  return <div className="analyst-office">
    <div className="office-toolbar"><span><i className={working || run?.analysts.some((a) => a.status === "running") ? "office-live working" : "office-live"} />{replaying ? "저장된 업무 장면 재생" : working ? `${ANALYSTS.find((a) => a.id === working)!.name} · 분석 중` : run ? `${run.assetName} 분석 사무실` : "분석팀 대기 중"}</span>
      <button className="icon-button" title={reducedMotion ? "동작 줄이기 설정으로 재생이 꺼져 있습니다" : "저장된 보고서의 업무 장면 다시 보기 · AI 호출 없음"} aria-label="업무 장면 다시 보기" disabled={!canReplay || replaying || reducedMotion} onClick={() => { replayStart.current = performance.now(); setReplaying(true); repaint.current(); }}><RotateCcw size={14} /></button></div>
    <canvas ref={canvas} className="office-scene" role="img" aria-label="밴드, 트렌, 리포, 체크가 사무실에서 분석하고 보고서를 캡틴에게 전달하는 업무 장면" title="캐릭터의 분석 기록 보기" onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect(), x = (event.clientX - bounds.left) / bounds.width, y = (event.clientY - bounds.top) / bounds.height;
      const match = hitboxes.current.findLast((box) => Math.abs(box.x - x) < .08 && Math.abs(box.y - y) < .09);
      if (match) input.current.onSelect(match.id);
    }} />
    {artFailed && <p className="analysis-notice" role="status">사무실 이미지 연결을 확인해 주세요. 분석 기록은 아래에서 볼 수 있습니다.</p>}
  </div>;
}
