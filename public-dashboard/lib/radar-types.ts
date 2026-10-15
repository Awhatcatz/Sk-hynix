export type AssetId = "hynix" | "samsung" | "nasdaq" | "kospi" | "gold" | "bitcoin";
export type SignalSide = "BUY" | "SELL" | "WAIT" | "UNAVAILABLE";
export interface Candle { time: string; open: number; high: number; low: number; close: number; volume: number }
export interface Technical {
  ma: Record<string, number | null>;
  rsi: number | null;
  macd: number | null;
  histogram: number | null;
  atr: number | null;
  score: number | null;
  support: number | null;
  resistance: number | null;
  bollinger: { upper: number; middle: number; lower: number; percentB: number | null; bandwidth: number | null } | null;
}
export interface Asset {
  id: AssetId; name: string; symbol: string; category: string; currency: string; unit: string;
  price: number | null; change: number | null; changePct: number | null; quoteTime: string | null;
  source: string; sourceUrl: string; stale: boolean; error: string | null;
  candles: Candle[]; technical: Technical; signal: { side: SignalSide; reason: string; barTime: string | null; confirmed: boolean; cross?: "UP" | "DOWN" | "NONE" };
}
export interface Quote {
  id: AssetId; price: number | null; change: number | null; changePct: number | null; quoteTime: string | null;
  stale: boolean; source: string; sourceUrl: string; mode: "STREAM" | "POLL";
  changeBasis: "PREVIOUS_CLOSE" | "ROLLING_24H"; delayMinutes: number | null;
}
export interface Quotes { generatedAt: string; quotes: Quote[]; providerStatus?: string }
export interface ResearchEvidence {
  id: string; publisher: string; title: string; published: string; period: string;
  kind: "ACTUAL" | "GUIDANCE" | "INDUSTRY_FORECAST" | "BROKER_ESTIMATE";
  summary: string; metrics: { name: string; value: string; unit: string }[]; url: string;
  verifiedAt: string;
}
export interface MemoryQuote { product: string; value: number; unit: "USD/chip"; observedAt: string; sourceUrl: string }
export interface Research {
  checkedAt: string; evidence: ResearchEvidence[]; memory: MemoryQuote[];
  memoryStatus: string; discoveries: NewsItem[]; warnings: string[];
}
export interface Macro { id: string; name: string; value: number | null; change: number | null; yoy: number | null; date: string | null; stale: boolean; sourceUrl: string }
export interface NewsItem { id: string; title: string; source: string; published: string; url: string }
export interface SignalEvent { id: string; assetId: AssetId; side: "BUY" | "SELL"; price: number; reason: string; barTime: string; createdAt: number }
export interface Snapshot { generatedAt: string; assets: Asset[]; macro: Macro[]; news: NewsItem[]; events: SignalEvent[]; methodologyVersion: string; warnings: string[]; research?: Research }
export interface Briefing {
  generatedAt: string; model: string; status: "ready" | "pending" | "unavailable" | "limited";
  headline: string; summary: string; regime: "RISK_ON" | "MIXED" | "RISK_OFF";
  hynixInsight: string; watchpoints: string[]; assetNotes: { id: AssetId; note: string }[];
  newsNotes: { newsId: string; note: string }[]; sourcesAsOf: string; warnings: string[];
  researchNotes?: { evidenceId: string; note: string }[];
}
export interface BriefingState {
  briefing: Briefing | null;
  outcome: "idle" | "stored" | "generated" | "reused" | "pending" | "limited" | "unavailable";
  message: string;
  usage: { day: string; used: number; limit: null; unlimited: true };
}
export const ASSETS: Pick<Asset, "id" | "name" | "symbol" | "category" | "currency" | "unit">[] = [
  { id: "hynix", name: "SK하이닉스", symbol: "000660.KS", category: "KRX 주식", currency: "KRW", unit: "원" },
  { id: "samsung", name: "삼성전자", symbol: "005930.KS", category: "KRX 주식", currency: "KRW", unit: "원" },
  { id: "nasdaq", name: "나스닥", symbol: "^IXIC", category: "나스닥 종합지수", currency: "USD", unit: "pt" },
  { id: "kospi", name: "코스피", symbol: "^KS11", category: "KRX 지수", currency: "KRW", unit: "pt" },
  { id: "gold", name: "금", symbol: "GC=F", category: "COMEX 금 선물", currency: "USD", unit: "USD/oz" },
  { id: "bitcoin", name: "비트코인", symbol: "BTC-USD", category: "현물 BTC/USD", currency: "USD", unit: "USD" },
];
export const EMPTY_TECHNICAL: Technical = { ma: { "5": null, "20": null, "60": null, "120": null }, rsi: null, macd: null, histogram: null, atr: null, score: null, support: null, resistance: null, bollinger: null };
export const SIGNAL_LABELS: Record<SignalSide, string> = { BUY: "매수 신호", SELL: "매도 신호", WAIT: "관망", UNAVAILABLE: "확인 불가" };
