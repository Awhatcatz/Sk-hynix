import { env } from "cloudflare:workers";
import { readCache, writeCache, acquireLock, releaseLock, database } from "../../../lib/radar-store";
import { researchUpdate } from "../../../lib/research-validation";
import type { ResearchEvidence } from "../../../lib/radar-types";
import { accessSession, denied } from "../../../lib/access";
import { latestMemory, mergeMemoryHistory } from "../../../lib/memory-history";

const isOwner = (request: Request) => !!env.SITE_OWNER_EMAIL && request.headers.get("oai-authenticated-user-email") === env.SITE_OWNER_EMAIL;
export async function GET(request: Request) {
  if (!await accessSession(request)) return denied();
  return Response.json({ canEdit: isOwner(request) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request) {
  if (!isOwner(request)) return Response.json({ error: "사이트 소유자 로그인이 필요합니다." }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "동일 사이트에서 등록하세요." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 30000) return Response.json({ error: "자료가 너무 큽니다." }, { status: 413 });
  const input = await request.text();
  if (input.length > 30000) return Response.json({ error: "자료가 너무 큽니다." }, { status: 413 });
  let parsed;
  try { parsed = researchUpdate.safeParse(JSON.parse(input)); } catch { return Response.json({ error: "올바른 JSON 자료가 필요합니다." }, { status: 400 }); }
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "입력 자료를 확인하세요." }, { status: 400 });
  if (!await acquireLock("research-write", 15000)) return Response.json({ error: "다른 자료를 저장 중입니다." }, { status: 409 });
  try {
    const data = parsed.data;
    if (data.action === "EVIDENCE") {
      const saved = await readCache<ResearchEvidence[]>("research-evidence:v1");
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.evidence.url + data.evidence.period + data.evidence.kind));
      const id = "verified-" + Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("").slice(0, 20);
      const item = { ...data.evidence, id, verifiedAt: new Date().toISOString().slice(0, 10) };
      await writeCache("research-evidence:v1", [...(saved?.value || []).filter((old) => old.id !== id), item].slice(-30));
    } else {
      const prior = await readCache<import("../../../lib/radar-types").MemoryQuote[]>("memory-history:v1");
      const history = mergeMemoryHistory(prior?.value || [], data.quotes);
      await writeCache("memory-history:v1", history); await writeCache("memory-licensed:v1", latestMemory(history));
    }
    await database().prepare("DELETE FROM radar_cache WHERE key IN ('markets:v3','briefing:v3')").run();
    return Response.json({ ok: true });
  } finally { await releaseLock("research-write"); }
}
