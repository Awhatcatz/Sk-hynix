import { getSnapshot } from "./radar";
import { getQuotes } from "./quotes";
import { closedCandles, technical } from "./technical";
import { acquireLease, database, readCache, releaseLease, writeCache } from "./radar-store";
import { getAiUsage, recordAiCall } from "./ai-usage";
import { availableBazeModels, generateAnalystReport } from "./baze-provider";
import { ANNUAL_ESTIMATES } from "./valuation";
import { ANALYSTS, ANALYST_DEADLINE_MS, finishRun, nextAnalyst, publicRun, sanitizeReport, type AnalystId, type CouncilAssetId, type CouncilRun, type StoredCouncilRun } from "./council-contract";
import { councilPrompt } from "./council-prompts";
import { resolveTradePlan } from "./trade-plan";

const key = (id: string) => `council-run:${id}`;
async function rawRun(id: string) { return (await readCache<StoredCouncilRun>(key(id)))?.value || null; }
async function saveRun(run: StoredCouncilRun) { run.updatedAt = new Date().toISOString(); run.revision = crypto.randomUUID(); await writeCache(key(run.id), run); }
async function saveIfCurrent(run: StoredCouncilRun, revision?: string) {
  run.updatedAt = new Date().toISOString(); run.revision = crypto.randomUUID();
  const result = await database().prepare("UPDATE radar_cache SET payload=?,updated_at=? WHERE key=? AND json_extract(payload,'$.revision') IS ?")
    .bind(JSON.stringify(run), Date.now(), key(run.id), revision || null).run();
  return result.meta.changes > 0;
}
const expired = (run: StoredCouncilRun) => run.analysts.filter((actor) => actor.status === "running" &&
  Date.parse(actor.deadlineAt || actor.startedAt || run.updatedAt) + (actor.deadlineAt ? 0 : ANALYST_DEADLINE_MS) <= Date.now());
function expireActors(run: StoredCouncilRun) {
  for (const actor of expired(run)) {
    actor.status = "error"; actor.completedAt = new Date().toISOString();
    actor.error = "요청 연결이 종료되거나 응답 시간이 초과됐습니다. 자동 재호출하지 않았으며 이미 전송한 요청에는 비용이 발생할 수 있습니다.";
  }
  finishRun(run);
  if (nextAnalyst(run)?.status === "pending") run.status = "pending";
}
export async function readCouncilRun(id: string) {
  const run = await rawRun(id);
  if (!run || !expired(run).length) return run;
  const lease = await acquireLease(`council:${id}`, 10000);
  if (lease === null) return run;
  try {
    const current = (await rawRun(id))!;
    if (expired(current).length) { const revision = current.revision; expireActors(current); await saveIfCurrent(current, revision); }
    return await rawRun(id);
  } finally { await releaseLease(`council:${id}`, lease); }
}
export async function councilHistory(assetId: CouncilAssetId) {
  const rows = await database().prepare("SELECT payload FROM radar_cache WHERE key LIKE 'council-run:%' AND json_extract(payload,'$.assetId')=? ORDER BY updated_at DESC LIMIT 12").bind(assetId).all<{ payload: string }>();
  const history: CouncilRun[] = [];
  for (const row of rows.results) { const stored = JSON.parse(row.payload) as StoredCouncilRun; history.push(publicRun(expired(stored).length ? (await readCouncilRun(stored.id)) || stored : stored)); }
  return history;
}
export async function startCouncil(assetId: CouncilAssetId, id: string, session: string): Promise<CouncilRun> {
  const lease = await acquireLease(`council:${id}`, 45000);
  if (lease === null) throw new Error("START_IN_PROGRESS");
  try {
    const existing = await rawRun(id);
    if (existing) {
      if (existing.assetId !== assetId || existing.createdBy !== session) throw new Error("RUN_ID_CONFLICT");
      return publicRun(existing);
    }
    const [snapshot, quotes] = await Promise.all([getSnapshot(), getQuotes().catch(() => null)]);
    const asset = snapshot.assets.find((item) => item.id === assetId);
    if (!asset) throw new Error("ASSET_UNAVAILABLE");
    const quote = quotes?.quotes.find((item) => item.id === assetId) || null;
    const bars = closedCandles(asset.candles, assetId, new Date(snapshot.generatedAt));
    const { candles: _candles, ...assetData } = asset;
    const now = new Date().toISOString();
    const stale = asset.stale || bars.length < 36 || asset.signal.side === "UNAVAILABLE" || !bars.at(-1) || Date.now() - Date.parse(bars.at(-1)!.time) > 7 * 86400000;
    const warnings = [...snapshot.warnings, ...(stale ? [`${asset.name} 시세 또는 확정 일봉의 최신성 확인 필요`] : [])];
    const evidence = assetId === "hynix" ? snapshot.research?.evidence || [] : [];
    const news = assetId === "hynix" ? snapshot.news : [];
    const sources = [
      { id: "daily", title: `${asset.name} 확정 일봉 · ${asset.source}`, url: asset.sourceUrl, date: bars.at(-1)?.time || null },
      { id: "quote", title: `${asset.name} 최근 시세 · ${quote?.source || asset.source}`, url: quote?.sourceUrl || asset.sourceUrl, date: quote?.quoteTime || asset.quoteTime },
      ...snapshot.macro.map((item) => ({ id: item.id, title: item.name, url: item.sourceUrl, date: item.date })),
      ...evidence.map((item) => ({ id: item.id, title: `${item.publisher} · ${item.title}`, url: item.url, date: item.published })),
      ...news.map((item) => ({ id: item.id, title: `${item.source} · 뉴스 제목`, url: item.url, date: item.published })),
    ].filter((item) => item.url.startsWith("https:"));
    const run: StoredCouncilRun = { id, assetId, assetName: asset.name, createdBy: session, createdAt: now, updatedAt: now, status: "pending",
      marketAsOf: snapshot.generatedAt, quoteAsOf: quotes?.generatedAt || null, dailyBarTime: bars.at(-1)?.time || null,
      stale, sources, warnings,
      analysts: ANALYSTS.map((item) => ({ id: item.id, model: item.model, status: "pending", report: null, error: null, startedAt: null, completedAt: null, attempts: 0, tokens: null })),
      context: { asset: assetData, quote, closedBars: bars.slice(-24), dailyTechnical: technical(bars), previousTechnical: technical(bars.slice(0, -1)),
        dailyBarTime: bars.at(-1)?.time || null, marketAsOf: snapshot.generatedAt, quoteAsOf: quotes?.generatedAt || null,
        macro: snapshot.macro, evidence, news, annualEstimates: assetId === "hynix" ? ANNUAL_ESTIMATES : null,
        memory: assetId === "hynix" ? snapshot.research?.memory || [] : [], memoryStatus: assetId === "hynix" ? snapshot.research?.memoryStatus || "승인된 가격 자료 없음" : "해당 자산 전용 메모리 가격 자료 아님", warnings },
    };
    await saveRun(run); return publicRun(run);
  } finally { await releaseLease(`council:${id}`, lease); }
}
export async function stepCouncil(id: string, session: string, retry = false, expected?: AnalystId): Promise<CouncilRun> {
  const initial = await readCouncilRun(id);
  if (!initial) throw new Error("RUN_NOT_FOUND");
  if (initial.createdBy !== session) throw new Error("RUN_NOT_OWNED");
  const lease = await acquireLease(`council:${id}`, 130000);
  if (lease === null) return publicRun(initial);
  try {
    const run = (await rawRun(id))!;
    if (expired(run).length) { expireActors(run); await saveRun(run); }
    // A disconnected request remains a paid attempt, never a reason to replay it.
    if (run.analysts.some((item) => item.status === "running")) return publicRun(run);
    if (retry) {
      const errors = run.analysts.filter((item) => item.status === "error");
      if (errors.length) {
        for (const item of errors) { item.status = "pending"; item.error = null; item.completedAt = null; item.deadlineAt = null; item.model = ANALYSTS.find((profile) => profile.id === item.id)!.model; }
        const master = run.analysts.find((item) => item.id === "master")!;
        master.status = "pending"; master.report = null; master.error = null; master.completedAt = null; master.model = ANALYSTS.find((profile) => profile.id === "master")!.model;
        delete run.tradePlan;
        run.status = "pending"; await saveRun(run);
      }
      return publicRun(run);
    }
    const actor = nextAnalyst(run);
    if (!actor) return publicRun(run);
    // A replay of an already-finished step must not advance a different paid model.
    if (expected !== actor.id) return publicRun(run);
    if (actor.id === "master" && !run.analysts.some((item) => item.id !== "master" && item.status === "done")) {
      actor.status = "error"; actor.error = "전문가 분석이 모두 실패해 종합 분석을 호출하지 않았습니다.";
      finishRun(run); await saveRun(run); return publicRun(run);
    }
    actor.status = "running"; actor.startedAt = new Date().toISOString(); actor.deadlineAt = new Date(Date.now() + ANALYST_DEADLINE_MS).toISOString(); actor.error = null; run.status = "running"; await saveRun(run);
    let attemptRevision = run.revision;
    try {
      const models = await availableBazeModels();
      if (!models.includes(actor.model)) throw new Error("MODEL_UNAVAILABLE");
      const prompt = councilPrompt(actor.id, run);
      await recordAiCall("analysis"); actor.attempts++; await saveRun(run);
      attemptRevision = run.revision;
      const generated = await generateAnalystReport(actor.model, prompt.instructions, prompt.data, actor.id === "master");
      actor.report = sanitizeReport(generated.report, run); actor.tokens = generated.tokens; actor.status = "done";
      if (actor.id === "master") {
        run.tradePlan = resolveTradePlan(run, actor.report.tradeDecision);
        if (actor.report.tradeDecision && actor.report.tradeDecision.action !== run.tradePlan.action) actor.report = { ...actor.report,
          tradeDecision: { action: "HOLD", candidateId: null, reason: run.tradePlan.reason }, headline: "보류 · 가격 조건 재확인 필요",
          summary: `${run.tradePlan.reason} 검증되지 않은 모델 의견 대신 보류를 최종 판단으로 적용합니다.` };
      }
    } catch (cause) {
      actor.status = "error";
      actor.error = cause instanceof Error && cause.message === "MODEL_UNAVAILABLE" ? "BAZE에서 이 모델을 사용할 수 없습니다. 다른 모델로 대신 분석하지 않았습니다." : "모델 연결 또는 응답 검증 실패. 실패한 호출도 사용량에 포함될 수 있습니다.";
    }
    actor.completedAt = new Date().toISOString(); finishRun(run);
    // Late responses cannot overwrite a reconciled or explicitly retried attempt.
    if (!await saveIfCurrent(run, attemptRevision)) return publicRun((await rawRun(id))!);
    return publicRun(run);
  } finally { await releaseLease(`council:${id}`, lease); }
}
export { getAiUsage };
