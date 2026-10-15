import type { ResearchEvidence } from "./radar-types";

// Manually verified public originals. Discovery feeds never auto-promote estimates.
export const RESEARCH_EVIDENCE: ResearchEvidence[] = [
  { id: "hynix-2026q2-actual", publisher: "SK하이닉스", title: "2026년 2분기 실적 발표", published: "2026-07-29", period: "2026Q2",
    kind: "ACTUAL", summary: "AI 서버용 고부가 제품 판매 확대에 따른 실적 발표. 향후 매출·영업이익 수치 가이던스와 구분해야 합니다.",
    metrics: [{ name: "연결 매출", value: "79.3187", unit: "조원" }, { name: "연결 영업이익", value: "60.5426", unit: "조원" }, { name: "영업이익률", value: "76", unit: "%" }],
    url: "https://news.skhynix.com/en/q2-2026-business-results/", verifiedAt: "2026-10-12" },
  { id: "hynix-2026-hbm-guidance", publisher: "SK하이닉스", title: "HBM4·NAND 생산 계획", published: "2026-07-29", period: "2026H2 / 연말 목표",
    kind: "GUIDANCE", summary: "HBM4는 2분기 양산 출하를 시작했으며 하반기 생산 확대를 계획했습니다. 미래 목표는 확정 실적이 아닙니다.",
    metrics: [{ name: "321단 NAND 국내 생산능력 비중", value: "약 50", unit: "% · 연말 목표" }],
    url: "https://news.skhynix.com/en/q2-2026-business-results/", verifiedAt: "2026-10-12" },
  { id: "ibk-hynix-20261007", publisher: "IBK투자증권", title: "실적에 수급을 더한다", published: "2026-10-07", period: "2026Q3E",
    kind: "BROKER_ESTIMATE", summary: "환율 영향을 반영한 개별 증권사 실적 추정. 날짜는 공식 게시일이며 전체 시장 컨센서스나 회사 가이던스가 아닙니다.",
    metrics: [{ name: "연결 매출", value: "95.8", unit: "조원" }, { name: "연결 영업이익", value: "75.1", unit: "조원" }, { name: "목표주가", value: "4,000,000", unit: "원/주 · 유지" }],
    url: "https://www.ibks.com/investment/research/businessAnalysis_view.do?seq=12557&popup=null", verifiedAt: "2026-10-12" },
  { id: "shinhan-hynix-20260930", publisher: "신한투자증권", title: "3Q26 실적 전망", published: "2026-09-30", period: "2026Q3E",
    kind: "BROKER_ESTIMATE", summary: "환율을 반영해 매출·영업이익 추정을 하향 조정하되 메모리 가격 상승 전망은 유지했습니다. 증권사 작성 원문의 공개 PDF이며 네이버가 호스팅합니다.",
    metrics: [{ name: "연결 매출", value: "95.451", unit: "조원" }, { name: "연결 영업이익", value: "73.837", unit: "조원" }, { name: "목표주가", value: "2,700,000", unit: "원/주 · 유지" }],
    url: "https://stock.pstatic.net/stock-research/company/21/20260930_company_263799000.pdf", verifiedAt: "2026-10-12" },
  { id: "trendforce-2026q4-contract", publisher: "TrendForce", title: "4Q26 일반 DRAM·NAND 계약가격 전망", published: "2026-09-30", period: "2026Q4",
    kind: "INDUSTRY_FORECAST", summary: "AI 서버 수요와 공급 배분으로 계약가격 상승을 전망하되 상승 속도는 둔화할 것으로 분석했습니다. 일반 DRAM 전망이며 HBM·하이닉스 ASP 전망과 다릅니다.",
    metrics: [{ name: "일반 DRAM 계약가격", value: "+10~15", unit: "% QoQ · 전망" }, { name: "NAND 계약가격", value: "+15~20", unit: "% QoQ · 전망" }],
    url: "https://www.trendforce.com/presscenter/news/20260930-13258.html", verifiedAt: "2026-10-12" },
  { id: "trendforce-2027-hbm", publisher: "TrendForce", title: "2027년 HBM 혼합 ASP 전망", published: "2026-09-29", period: "2027E",
    kind: "INDUSTRY_FORECAST", summary: "제품 세대 전환과 제한적인 생산능력을 반영한 HBM 시장 전망. 혼합 ASP 증가는 제품 믹스 영향도 포함하며 특정 회사 가격 인상을 뜻하지 않습니다.",
    metrics: [{ name: "HBM 혼합 ASP", value: "+121", unit: "% YoY · 전망" }],
    url: "https://www.trendforce.com/presscenter/news/20260929-13255.html", verifiedAt: "2026-10-12" },
];
