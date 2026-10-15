"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Calculator, CheckCircle2, Clock3 } from "lucide-react";
import { entryDistance, positionSimulation, priceConditionTouched } from "../lib/investor-tools";
import type { TradeCandidate, TradePlan } from "../lib/trade-plan";
import type { CouncilAssetId } from "../lib/council-contract";
import type { Quote } from "../lib/radar-types";

export default function BuyEntryTools({ candidate, plan, quote, assetId }: { candidate: TradeCandidate; plan: TradePlan; quote?: Quote; assetId: CouncilAssetId }) {
  const [armed, setArmed] = useState(false), [notice, setNotice] = useState("");
  const [budget, setBudget] = useState(""), [riskBudget, setRiskBudget] = useState("");
  const fired = useRef(false);
  const touched = priceConditionTouched(candidate, quote?.price);
  const distance = entryDistance(candidate, quote?.price);
  const simulation = positionSimulation(assetId, candidate, Number(budget), Number(riskBudget));
  const money = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: plan.unit === "원" ? 0 : 2 })} ${plan.unit}`;
  useEffect(() => {
    if (!armed || !touched || fired.current) return;
    fired.current = true;
    setNotice(`${new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} KST · 관찰 가격에 도달했어요. 아직 매수 확정은 아닙니다. 반등을 확정 일봉으로 확인하세요.`);
  }, [armed, touched]);
  return <div className="buy-entry-tools">
    <div className="entry-readiness"><span className={touched ? "entry-contact" : ""}>{touched ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}{touched ? "관찰 가격 접촉" : distance === null ? "현재 시세 확인 중" : `${Math.abs(distance).toFixed(2)}% ${distance < 0 ? "하락" : "상승"} 시 관찰 가격`}</span><small>확정 일봉의 반등 확인 필요</small><button type="button" className="icon-button" aria-label="가격 도달 알림" aria-pressed={armed} title={armed ? "가격 알림 끄기" : "이 창에서 관찰 가격 접촉 시 한 번 알림"} onClick={() => { setArmed(!armed); fired.current = false; setNotice(""); }}>{armed ? <Bell size={16} /> : <BellOff size={16} />}</button></div>
    <p className="entry-alert-note">{armed ? "알림 켜짐" : "알림 꺼짐"} · 이 창이 열려 있고 시세가 유효할 때만 · 새 분석 시 해제</p>
    {notice && <p className="entry-alert" role="status">{notice}</p>}
    {assetId === "hynix" || assetId === "bitcoin" ? <details className="position-simulation"><summary><Calculator size={14} />얼마를 넣으면 손익이 얼마일까?</summary>
      <div className="simulation-inputs"><label>가상 투자금 ({plan.unit})<input aria-label="가상 투자금" inputMode="decimal" type="number" min="0" step="any" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder={plan.unit === "원" ? "1000000" : "1000"} /></label><label>가정 손실 예산 ({plan.unit})<input aria-label="가정 손실 예산" inputMode="decimal" type="number" min="0" step="any" value={riskBudget} onChange={(event) => setRiskBudget(event.target.value)} placeholder={plan.unit === "원" ? "50000" : "50"} /></label></div>
      {simulation ? <dl className="simulation-result"><div><dt>가상 수량</dt><dd>{simulation.quantity.toLocaleString("ko-KR", { maximumFractionDigits: assetId === "bitcoin" ? 8 : 0 })}{assetId === "bitcoin" ? " BTC" : "주"}</dd></div><div><dt>진입 가정 금액</dt><dd>{money(simulation.investment)}</dd></div><div><dt>목표가 체결 시</dt><dd className="positive">+{money(simulation.profit)}</dd></div><div><dt>무효가 체결 시</dt><dd className="negative">-{money(simulation.loss)}</dd></div></dl> : budget || riskBudget ? <p className="simulation-note">양수 금액 두 개를 입력하세요. {assetId === "hynix" ? "1주를 살 투자금과 가정 손실 예산이 필요합니다." : "0.00000001 BTC 이상 계산 가능한 금액이 필요합니다."}</p> : null}
      <p className="simulation-note">투자금과 손실 예산을 모두 넘지 않는 가상 수량 · 입력값은 이 화면에서만 사용</p><p className="simulation-warning">진입·무효 가격에 그대로 체결된다는 가정입니다. 실제 손실 상한이 아니며 수수료·세금·갭·호가 단위는 제외합니다.{assetId === "bitcoin" ? " USD 기준이며 원화 환산과 거래소별 차이는 반영하지 않습니다." : ""}</p>
    </details> : <p className="entry-alert-note">지수 pt는 관찰 기준입니다. ETF·선물의 매수가나 수량으로 바꿔 적용하지 마세요.</p>}
  </div>;
}
