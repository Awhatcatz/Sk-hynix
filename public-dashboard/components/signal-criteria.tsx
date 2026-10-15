import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import type { Asset, AssetId, Snapshot } from "../lib/radar-types";

const CONTEXT: Record<AssetId, { title: string; text: string }[]> = {
  hynix: [
    { title: "HBM 수익성", text: "고객 인증·출하 일정, HBM 믹스와 계약가격, 수율 개선 여부. DDR4 현물가만으로 HBM 매출을 추정하지 않습니다." },
    { title: "메모리 사이클", text: "DDR5·서버 DRAM 계약가격, NAND/eSSD 수요, 재고와 설비투자. 현물과 계약가격은 서로 다른 시장입니다." },
    { title: "추정치 수정", text: "같은 분기의 매출·영업이익 추정치를 리포트별로 비교하고, 발표일·추정 기준을 확인합니다." },
  ],
  samsung: [
    { title: "DS 실적과 HBM", text: "메모리 가격, HBM 고객 인증·출하, DS 부문 이익과 파운드리 손익을 함께 확인합니다." },
    { title: "비메모리 사업", text: "스마트폰·디스플레이 실적과 환율도 중요합니다. 메모리 업황만으로 전체 이익을 판단하지 않습니다." },
    { title: "국내 시장 위험", text: "하이닉스와 동일한 코스피 필터를 적용합니다. 외국인 수급·원/달러는 현재 미수집 참고 항목입니다." },
  ],
  bitcoin: [
    { title: "24시간 거래", text: "Coinbase BTC/USD 체결가와 최근 24시간 변동입니다. 차트와 확정 신호는 별도로 표시한 Yahoo 일봉 기준입니다." },
    { title: "유동성과 변동성", text: "달러 유동성·실질금리, ETF 자금 흐름, 레버리지 청산은 참고 항목이며 현재 자동 수집하지 않습니다." },
    { title: "과열과 거래소 차이", text: "볼린저 밴드 폭과 RSI 과열을 관찰합니다. 한 거래소의 가격은 전체 시장 또는 원화 거래소 가격이 아닙니다." },
  ],
  nasdaq: [
    { title: "금리와 이익 전망", text: "미국채 10년물, PCE와 대형 기술주의 실적·가이던스를 함께 확인합니다. 금리 상승이 곧바로 매도 신호는 아닙니다." },
    { title: "시장 폭", text: "상승 종목 비중과 반도체 상대 강도는 현재 미수집 참고 항목입니다. 지수 상승만으로 시장 전반의 강세를 단정하지 않습니다." },
    { title: "지수와 투자 상품", text: "나스닥 종합지수는 직접 주문 가능한 자산이 아닙니다. 나스닥100·ETF와 구성 및 수익률이 다릅니다." },
  ],
  kospi: [{ title: "국내 위험 지표", text: "반도체 비중, 환율과 외국인 수급을 참고합니다. 코스피 기술 점수는 두 국내 종목의 위험 필터에 사용합니다." }],
  gold: [{ title: "선물과 현물", text: "COMEX 연속 금 선물입니다. 실질금리·달러·만기 교체 영향을 확인하고 현물 금 가격으로 해석하지 않습니다." }],
};

export default function SignalCriteria({ asset, snapshot }: { asset: Asset | undefined; snapshot: Snapshot | null }) {
  if (!asset) return <section className="criteria-section"><h2>매수 신호 판단 기준</h2><p className="empty-feed">확정 일봉 수집 중</p></section>;
  const t = asset.technical, kospi = snapshot?.assets.find((item) => item.id === "kospi"), hy = snapshot?.macro.find((item) => item.id === "BAMLH0A0HYM2");
  const criteria: { label: string; value: string; pass: boolean | null }[] = [
    { label: "확정 일봉·최신 자료", value: asset.signal.barTime || "확인 불가", pass: asset.stale || !asset.signal.confirmed ? false : true },
    { label: "MA5 / MA20 신규 상향 교차", value: asset.signal.cross === "UP" ? "상향 교차" : asset.signal.cross === "DOWN" ? "하향 교차" : "상향 교차 없음", pass: asset.signal.cross ? asset.signal.cross === "UP" : null },
    { label: "RSI 14 · 40~70", value: t.rsi?.toFixed(1) ?? "--", pass: t.rsi == null ? null : t.rsi >= 40 && t.rsi <= 70 },
    { label: "MACD 히스토그램 ≥ 0", value: t.histogram?.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) ?? "--", pass: t.histogram == null ? null : t.histogram >= 0 },
  ];
  if (["hynix", "samsung"].includes(asset.id)) {
    criteria.push({ label: "코스피 최신값·기술 점수 ≥ 40", value: kospi?.stale ? "갱신 필요" : `${kospi?.technical.score ?? "--"} / 100`, pass: kospi ? !kospi.stale && (kospi.technical.score ?? 0) >= 40 : null });
    criteria.push({ label: "하이일드 ≥ 5% 시 보류", value: hy?.value != null && !hy.stale ? `${hy.value.toFixed(2)}%` : "권한 미확보 · 필터 미적용", pass: hy?.value != null && !hy.stale ? hy.value < 5 : null });
  }
  return <section className="criteria-section" aria-labelledby="criteriaTitle">
    <div className="section-heading"><h2 id="criteriaTitle">{asset.name} 매수 신호 판단 기준</h2><span className="subtle">확정 일봉 {asset.signal.barTime || "--"} · 규칙 신호</span></div>
    <div className="criteria-grid">{criteria.map((item) => <div className={`criterion ${item.pass === true ? "met" : item.pass === false ? "unmet" : "unknown"}`} key={item.label}>
      {item.pass === true ? <CheckCircle2 size={15} /> : item.pass === false ? <Circle size={15} /> : <CircleAlert size={15} />}<div><span>{item.label}</span><strong>{item.value}</strong></div>
    </div>)}</div>
    <p className="criteria-note">모든 필수 조건이 충족된 신규 교차에서만 매수 신호가 발생합니다. 매도는 MA5/MA20 신규 하향 교차입니다. 볼린저 밴드(20일·2σ)와 아래 업황 항목은 해석용이며 확정 신호를 변경하지 않습니다. 하이일드 결측은 정상 판정이 아닙니다.</p>
    <div className="context-grid">{CONTEXT[asset.id].map((item) => <div key={item.title}><h3>{item.title}</h3><p>{item.text}</p></div>)}</div>
  </section>;
}
