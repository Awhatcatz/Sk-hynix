import { env } from "cloudflare:workers";
import { acquireLock, readCache, releaseLock, writeCache } from "./radar-store";
import { parseTossCandles, priorClose, tossPrice } from "./toss-data";
import { ASSETS, type Asset, type AssetId, type Candle, type Quote } from "./radar-types";
import { closedCandles, technical, signalFor } from "./technical";
import { quoteIsStale } from "./market-time";

const origin = "https://openapi.tossinvest.com";
const symbols: Partial<Record<AssetId, string>> = { hynix: "000660", samsung: "005930", kospi: "KOSPI" };
type SealedToken = { cipher: number[]; iv: number[]; expires: number };
export function tossConfigured() { return !!(env.TOSS_CLIENT_ID && env.TOSS_CLIENT_SECRET && env.TOSS_TOKEN_ENCRYPTION_KEY && env.TOSS_TOKEN_ENCRYPTION_KEY.length >= 32 && env.TOSS_SHARING_APPROVED === "true"); }
export function tossSetupStatus() {
  if (!env.TOSS_CLIENT_ID || !env.TOSS_CLIENT_SECRET) return "토스 공식 API 키 등록 대기 · 현재 일반 시세 피드";
  if (env.TOSS_SHARING_APPROVED !== "true") return "토스 시세의 링크 공유 이용권한 확인 대기";
  if (!env.TOSS_TOKEN_ENCRYPTION_KEY) return "토스 서버 암호화 설정 대기";
  return "토스 최근 체결가 10초 조회 · 배포 서버 허용 IP 필요";
}
async function encryptionKey() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.TOSS_TOKEN_ENCRYPTION_KEY!));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function token(): Promise<string> {
  const fingerprint = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.TOSS_CLIENT_ID));
  const cacheKey = "toss-oauth:" + Array.from(new Uint8Array(fingerprint)).map((value) => value.toString(16).padStart(2, "0")).join("").slice(0, 24);
  const open = async () => {
    const saved = await readCache<SealedToken>(cacheKey);
    if (!saved || saved.value.expires <= Date.now() + 60000) return null;
    try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(saved.value.iv) }, await encryptionKey(), new Uint8Array(saved.value.cipher))); } catch { return null; }
  };
  const cached = await open(); if (cached) return cached;
  // One client has only one valid token. A D1 lock prevents parallel issuance.
  if (!await acquireLock(cacheKey, 20000)) {
    for (let i = 0; i < 12; i++) { await new Promise((resolve) => setTimeout(resolve, 250)); const ready = await open(); if (ready) return ready; }
    throw new Error("토스 인증 갱신 중");
  }
  try {
    const ready = await open(); if (ready) return ready;
    const failed = await readCache<number>("toss-auth-backoff");
    if (failed && Date.now() - failed.value < 60000) throw new Error("토스 인증 재시도 대기");
    const response = await fetch(origin + "/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.TOSS_CLIENT_ID!, client_secret: env.TOSS_CLIENT_SECRET! }) });
    if (!response.ok) { await writeCache("toss-auth-backoff", Date.now()); throw new Error(response.status === 403 ? "토스 배포 서버 IP 등록 필요" : "토스 공식 인증 설정 확인 필요"); }
    const data = await response.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token || !Number.isFinite(data.expires_in) || data.expires_in! < 120) throw new Error("토스 인증 응답 확인 필요");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(data.access_token));
    await writeCache(cacheKey, { cipher: Array.from(new Uint8Array(encrypted)), iv: Array.from(iv), expires: Date.now() + data.expires_in! * 1000 });
    return data.access_token;
  } finally { await releaseLock(cacheKey); }
}
async function read(path: string, params: URLSearchParams) {
  // Read-only allowlist; no account, holdings, order APIs or account headers.
  if (!/^\/api\/v1\/(prices|candles|market-indicators\/prices|market-indicators\/KOSPI\/candles)$/.test(path)) throw new Error("Unsupported market endpoint");
  const response = await fetch(origin + path + "?" + params, { headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(response.status === 403 ? "토스 배포 서버 IP 등록 또는 이용권한 확인 필요" : response.status === 429 ? "토스 시세 조회 한도 · 재시도 대기" : "토스 시세 연결 확인 필요");
  const data = await response.json() as { result: unknown }; return data.result;
}
export async function tossCandles(id: AssetId): Promise<Candle[]> {
  const symbol = symbols[id]; if (!symbol) throw new Error("Unsupported symbol");
  const cached = await readCache<Candle[]>(`toss-candles:${id}`);
  if (cached && Date.now() - cached.updatedAt < 180000) return cached.value;
  const unique = new Map<string, Candle>(); let before: string | null = null;
  for (let page = 0; page < 2; page++) {
    const params = new URLSearchParams({ interval: "1d", count: "200", adjusted: "true" });
    if (id !== "kospi") params.set("symbol", symbol);
    if (before) params.set("before", before);
    const parsed = parseTossCandles(await read(id === "kospi" ? "/api/v1/market-indicators/KOSPI/candles" : "/api/v1/candles", params));
    parsed.candles.forEach((bar) => unique.set(bar.time, bar));
    if (!parsed.nextBefore || parsed.nextBefore === before) break;
    before = parsed.nextBefore;
  }
  const candles = [...unique.values()].sort((a, b) => a.time.localeCompare(b.time)).slice(-320);
  if (!candles.length) throw new Error("토스 일봉 확보 대기");
  await writeCache(`toss-candles:${id}`, candles); return candles;
}
export async function tossQuotes(): Promise<Quote[]> {
  const [stocks, index] = await Promise.all([read("/api/v1/prices", new URLSearchParams({ symbols: "000660,005930" })), read("/api/v1/market-indicators/prices", new URLSearchParams({ symbols: "KOSPI" }))]);
  const values = tossPrice.array().parse([...(Array.isArray(stocks) ? stocks : []), ...(Array.isArray(index) ? index : [])]);
  return Promise.all((["hynix", "samsung", "kospi"] as const).map(async (id) => {
    const current = values.find((item) => item.symbol === symbols[id]);
    if (!current) throw new Error("토스 시세 응답 누락");
    const candles = await readCache<Candle[]>(`toss-candles:${id}`);
    const previous = priorClose(candles?.value || [], current.timestamp);
    return { id, price: current.lastPrice, change: previous ? current.lastPrice - previous : null, changePct: previous ? (current.lastPrice / previous - 1) * 100 : null,
      quoteTime: current.timestamp, stale: !current.timestamp || quoteIsStale(id, Date.parse(current.timestamp) / 1000), source: "토스증권 Open API", sourceUrl: "https://developers.tossinvest.com/", mode: "POLL", changeBasis: "PREVIOUS_CLOSE", delayMinutes: 0 };
  }));
}
export async function tossAsset(config: typeof ASSETS[number]): Promise<Asset> {
  const candles = await tossCandles(config.id);
  const quotes = await readCache<Quote[]>("toss-last-quotes");
  let quote = quotes && Date.now() - quotes.updatedAt < 30000 ? quotes.value.find((item) => item.id === config.id) : undefined;
  if (!quote) { const fresh = await tossQuotes(); await writeCache("toss-last-quotes", fresh); quote = fresh.find((item) => item.id === config.id); }
  if (!quote) throw new Error("토스 체결가 확보 대기");
  const stale = !quote.quoteTime || quoteIsStale(config.id, Date.parse(quote.quoteTime) / 1000);
  const closed = closedCandles(candles, config.id, new Date());
  return { ...config, ...quote, stale, candles, technical: technical(closed), signal: signalFor(closed, stale), error: null };
}
