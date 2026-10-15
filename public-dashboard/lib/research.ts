import { XMLParser } from "fast-xml-parser";
import { RESEARCH_EVIDENCE } from "./research-evidence";
import { readCache, writeCache } from "./radar-store";
import type { MemoryQuote, NewsItem, Research, ResearchEvidence } from "./radar-types";
import { collectMemoryDaily } from "./memory-collector";

async function discover(): Promise<NewsItem[]> {
  try {
    const response = await fetch(`https://news.google.com/rss/search?${new URLSearchParams({ q: "SK하이닉스 (리포트 OR 가이던스 OR 실적추정) when:14d", hl: "ko", gl: "KR", ceid: "KR:ko" })}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];
    const items = new XMLParser({ ignoreAttributes: false }).parse(await response.text()).rss?.channel?.item;
    if (!items) return [];
    return (Array.isArray(items) ? items : [items]).slice(0, 5).map((item, index) => ({ id: `discovery-${index}`, title: String(item.title || ""), url: String(item.link || ""), published: String(item.pubDate || ""), source: String(item.source?.["#text"] || item.source || "뉴스 탐색") }));
  } catch { return []; }
}

export async function getResearch(): Promise<Research> {
  const collectionStatus = await collectMemoryDaily();
  const [extra, imported, found] = await Promise.all([
    readCache<ResearchEvidence[]>("research-evidence:v1"), readCache<MemoryQuote[]>("memory-licensed:v1"), readCache<NewsItem[]>("research-discovery:v1"),
  ]);
  const discoveries = found && Date.now() - found.updatedAt < 6 * 3600000 ? found.value : await discover();
  if (!found || Date.now() - found.updatedAt >= 6 * 3600000) await writeCache("research-discovery:v1", discoveries);
  const memory = imported?.value || [];
  const evidence = [...RESEARCH_EVIDENCE, ...(extra?.value || [])].sort((a, b) => b.published.localeCompare(a.published));
  return { checkedAt: new Date().toISOString(), evidence, memory,
    memoryStatus: (memory.length ? "승인 자료 · 관측일 기준 · " : "") + collectionStatus,
    discoveries, warnings: memory.length ? memory.filter((item) => Date.now() - Date.parse(item.observedAt) > 5 * 86400000).map((item) => `${item.product}: 현물가격 관측일 확인 필요`)
      : ["현물가격 숫자는 승인 전 제공하지 않습니다. 공개 보도자료의 계약가격 전망은 별도 자료입니다."] };
}
