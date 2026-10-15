"use client";
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Pause, ShieldAlert } from "lucide-react";
import { buyScenario, effectiveTradePlan, formatPriceCondition } from "../lib/trade-plan";
import type { CouncilRun } from "../lib/council-contract";
import type { Quote } from "../lib/radar-types";
import BuyEntryTools from "./buy-entry-tools";

export default function MasterDecision({ run, quote }: { run: CouncilRun; quote?: Quote }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const master = run.analysts.find((a) => a.id === "master");
  if (master?.status !== "done") return null;
  const plan = effectiveTradePlan(run.tradePlan, now, quote || null);
  const action = plan?.action || "HOLD", candidate = plan?.candidate;
  const buy = buyScenario(plan), displayCandidate = buy || candidate;
  const Icon = action === "BUY" ? ArrowUpRight : action === "SELL" ? ArrowDownRight : Pause;
  const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return <section className={`master-decision decision-${action.toLowerCase()}`} aria-label="캡틴의 가격 조건 판단">
    <div className="decision-heading"><span><Icon size={19} /><strong>캡틴: {action === "BUY" ? "조건부 매수" : action === "SELL" ? "조건부 매도" : "보류"}</strong></span><small>AI 조건부 판단</small></div>
    {displayCandidate && plan ? <>
      <p className="entry-caption">{buy ? action === "BUY" ? "캡틴의 조건부 매수 검토 가격" : plan.buyWatch?.selectedBy === "MASTER" ? "캡틴이 추천한 다음 매수 관찰 가격 · 현재 판단은 보류" : "차트 기반 매수 관찰 후보 · 캡틴 판단은 보류" : "보유 물량 축소 검토 가격"}</p>
      <h3>{formatPriceCondition(displayCandidate.trigger, plan.unit)}</h3><p className="entry-command">{buy ? "반등 확인 후 매수 검토" : "보유 물량 축소 검토"}</p>
      <p className="decision-confirmation">{displayCandidate.confirmation}</p>
      <dl className="decision-levels">{displayCandidate.target && <div><dt>목표 구간</dt><dd>{formatPriceCondition(displayCandidate.target, plan.unit)}</dd>{buy && <small>진입 기준 +{((displayCandidate.target.price / buy.trigger.price - 1) * 100).toFixed(2)}%</small>}</div>}<div><dt>판단이 틀리는 조건</dt><dd>{formatPriceCondition(displayCandidate.invalidation, plan.unit)}</dd>{buy && <small>진입 기준 {((buy.invalidation.price / buy.trigger.price - 1) * 100).toFixed(2)}%</small>}</div></dl>
      {buy && <><p className="entry-reward">가정 손익비 <strong>1:{buy.riskReward}</strong><span>목표까지의 이익 ÷ 무효가까지의 손실 · 확률 아님</span></p><BuyEntryTools key={`${run.id}:${plan.asOf}:${buy.id}`} candidate={buy} plan={plan} quote={quote} assetId={run.assetId} /></>}
    </> : null}
    <p className="decision-reason">{plan?.reason || "이 기록에는 검증된 가격 조건이 없습니다. 새 AI 분석이 필요합니다."}</p>
    {plan && <div className="decision-timing"><span>확정 일봉 {plan.dailyBarTime || "없음"}</span><span>판단 {date(plan.asOf)} KST</span><span>유효 {date(plan.validUntil)} KST까지</span></div>}
    <p className="decision-warning"><ShieldAlert size={13} />가격만 닿았다고 매매 조건이 충족되지는 않습니다. 손실 가능 · 자동 주문 없음</p>
    <details className="decision-detail"><summary>가격 기준 · 유의사항</summary>{displayCandidate && <p>{displayCandidate.trigger.basis}{displayCandidate.target ? ` · 목표: ${displayCandidate.target.basis}` : ""} · 무효화: {displayCandidate.invalidation.basis}</p>}<p>확정 기술 신호와 별개인 AI 시나리오 · 백테스트 미검증 · 손익비는 비용 제외 · 갭 발생 가능{run.assetId === "nasdaq" || run.assetId === "kospi" ? " · 지수 pt는 관측 기준이며 실제 거래 상품 가격과 다릅니다." : " · 표시 가격은 기준값이며 실제 주문 호가와 다를 수 있습니다."}</p><p><a href="https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/bollinger-bands" target="_blank" rel="noreferrer">볼린저 밴드 기준</a> · <a href="https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-15" target="_blank" rel="noreferrer">손실 기준과 실제 체결 가격의 차이</a></p></details>
  </section>;
}
