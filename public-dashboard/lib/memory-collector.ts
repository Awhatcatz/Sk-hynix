import { env } from "cloudflare:workers";
import { acquireLock, readCache, releaseLock, writeCache } from "./radar-store";
import { memoryInput } from "./research-validation";
import { latestMemory, mergeMemoryHistory } from "./memory-history";
import type { MemoryQuote } from "./radar-types";

export async function collectMemoryDaily() {
  if (!env.MEMORY_FEED_URL || env.MEMORY_REDISTRIBUTION_APPROVED !== "true") return "자동 수집 대기 · TrendForce 수집·링크 공유 허락 및 승인 피드 필요";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const checked = await readCache<string>("memory-daily-check");
  if (checked?.value.startsWith(day)) return checked.value;
  if (!await acquireLock("memory-daily-collect", 20000)) return "승인 피드 일일 수집 중";
  try {
    const current = await readCache<string>("memory-daily-check");
    if (current?.value.startsWith(day)) return current.value;
    const url = new URL(env.MEMORY_FEED_URL);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid feed");
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: env.MEMORY_FEED_KEY ? { Authorization: `Bearer ${env.MEMORY_FEED_KEY}` } : {} });
    if (!response.ok) throw new Error("Feed unavailable");
    const raw = await response.text(); if (raw.length > 30000) throw new Error("Feed too large");
    const quotes = memoryInput.array().min(1).max(12).parse(JSON.parse(raw).quotes);
    const prior = await readCache<MemoryQuote[]>("memory-history:v1");
    const history = mergeMemoryHistory(prior?.value || [], quotes);
    await writeCache("memory-history:v1", history); await writeCache("memory-licensed:v1", latestMemory(history));
    const status = `${day} KST 일일 승인 피드 수집 완료 · ${quotes.length}제품 · 관측일 별도 표시`;
    await writeCache("memory-daily-check", status); return status;
  } catch {
    const status = `${day} KST 승인 피드 수집 실패 · 원 관측일 유지 · 다음 일자 재시도`;
    await writeCache("memory-daily-check", status); return status;
  } finally { await releaseLock("memory-daily-collect"); }
}
