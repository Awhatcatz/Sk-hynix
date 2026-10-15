import { database, readCache } from "./radar-store";

export const aiDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
export async function recordAiCall(kind: "analysis" | "chat") {
  const key = `${kind === "analysis" ? "ai-budget" : "chat-total"}:${aiDay()}`;
  await database().prepare("INSERT INTO radar_cache(key,payload,updated_at) VALUES(?,'1',?) ON CONFLICT(key) DO UPDATE SET payload=CAST(CAST(payload AS INTEGER)+1 AS TEXT),updated_at=excluded.updated_at")
    .bind(key, Date.now()).run();
}
export async function getAiUsage() {
  const day = aiDay();
  const [analysis, chat] = await Promise.all([readCache<number>(`ai-budget:${day}`), readCache<number>(`chat-total:${day}`)]);
  const analysisCalls = Number(analysis?.value) || 0, chatCalls = Number(chat?.value) || 0;
  return { day, analysisCalls, chatCalls, totalCalls: analysisCalls + chatCalls, unlimited: true as const };
}
