import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { randomUUID } from "node:crypto";
import { ASSETS, EMPTY_TECHNICAL } from "../lib/radar-types";
import { ANALYSTS, ANALYST_DEADLINE_MS, publicRun, reportSchema, type AnalystReport } from "../lib/council-contract";
import { compatibleClaudeSchema } from "../lib/provider-schema";

const report: AnalystReport = { stance: "NEUTRAL", headline: "Evidence summary", summary: "Test-only evidence", findings: [{ observation: "Daily observation", sourceId: "daily" }, { observation: "Not in data", sourceId: "invented" }], upsideCondition: "Close above MA20", downsideCondition: "Close below support", caution: "No guarantees", lesson: "Average of closes", agreements: [], disagreements: [], watchpoints: [] };
const bars = Array.from({ length: 220 }, (_, i) => ({ time: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), open: 100 + i, high: 102 + i, low: 98 + i, close: 101 + i, volume: 1000 }));
const harness = {
  cache: new Map<string, { value: unknown; updatedAt: number }>(), locks: new Map<string, number>(), calls: [] as { model: string; data: unknown }[], fail: "",
  stale: false, watch: false, hold: null as Promise<void> | null, capturedAt: null as string | null,
  read(key: string) { return structuredClone(this.cache.get(key) || null); },
  write(key: string, value: unknown) { this.cache.set(key, { value: structuredClone(value), updatedAt: Date.now() }); },
  snapshot() { return { generatedAt: this.capturedAt || new Date().toISOString(), assets: ASSETS.map((asset) => ({ ...asset, price: 320, quoteTime: new Date().toISOString(), change: 1, changePct: 1, source: "Test", sourceUrl: "https://finance.yahoo.com", stale: this.stale, error: null, candles: this.capturedAt ? [...bars, { ...bars.at(-1)!, time: "2026-10-12" }, { ...bars.at(-1)!, time: "2026-10-13" }] : bars, technical: EMPTY_TECHNICAL, signal: { side: "WAIT", reason: "test", confirmed: false, barTime: bars.at(-1)!.time } })), macro: [], news: [{ id: "hynix-news", title: "Hynix only", source: "Test", published: "2026-10-01", url: "https://example.com" }], events: [], warnings: [], research: { evidence: [], memory: [], memoryStatus: "No feed", warnings: [] } }; },
  async generate(model: string, instructions: string, data: unknown, master = false) { this.calls.push({ model, data }); if (this.hold) await this.hold; if (this.fail && instructions.includes(this.fail)) throw new Error("Test failure"); return { report: master ? { ...report, tradeDecision: this.watch ? { action: "HOLD", candidateId: null, watchCandidateId: "buy-support", reason: "Test-only watch" } : { action: "BUY", candidateId: "buy-support", reason: "Test-only chart scenario" } } : report, tokens: { input: 100, output: 100, total: 200 } }; },
  db: { prepare(sql: string) { return { bind(...values: unknown[]) { return {
    async run() {
      if (sql.startsWith("UPDATE radar_cache")) {
        const [payload, , key, revision] = values as [string, number, string, string | null];
        if (((harness.read(key)?.value as any)?.revision || null) !== revision) return { meta: { changes: 0 } };
        harness.write(key, JSON.parse(payload)); return { meta: { changes: 1 } };
      }
      assert.ok(!sql.includes("WHERE")); const [key] = values as [string]; harness.write(key, (Number(harness.read(key)?.value) || 0) + 1); return { meta: { changes: 1 } };
    },
    async all() { const result = [...harness.cache].filter(([key, row]) => key.startsWith("council-run:") && (row.value as any).assetId === values[0]); return { results: result.map(([, row]) => ({ payload: JSON.stringify(row.value) })) }; },
  }; } }; } },
};
const globals = globalThis as typeof globalThis & { __councilTest?: typeof harness };
globals.__councilTest = harness;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/lib/")) {
      if (specifier === "./radar-store") return { url: "council-test:store", shortCircuit: true };
      if (context.parentURL.endsWith("/lib/council.ts") && ["./radar", "./quotes", "./baze-provider"].includes(specifier)) return { url: "council-test:providers", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const sources: Record<string, string> = {
      "council-test:store": `const h=globalThis.__councilTest;export const readCache=async key=>h.read(key);export const writeCache=async(key,value)=>h.write(key,value);export const acquireLease=async(key,duration)=>{if((h.locks.get(key)||0)>=Date.now())return null;const lease=Date.now()+duration;h.locks.set(key,lease);return lease;};export const releaseLease=async(key,lease)=>{if(h.locks.get(key)===lease)h.locks.delete(key);};export const database=()=>h.db;`,
      "council-test:providers": `const h=globalThis.__councilTest;export const getSnapshot=async()=>h.snapshot();export const getQuotes=async()=>({generatedAt:new Date().toISOString(),quotes:[]});export const availableBazeModels=async()=>['gpt-6.1-sol','gpt-6-astra','claude-opus-5-5','claude-fable-5-1'];export const generateAnalystReport=(...args)=>h.generate(...args);`,
    };
    return sources[url] ? { format: "module", source: sources[url], shortCircuit: true } : next(url, context);
  },
});
const { startCouncil, stepCouncil, readCouncilRun, councilHistory, getAiUsage } = await import("../lib/council");
after(() => { hooks.deregister(); delete globals.__councilTest; });
beforeEach(() => { harness.cache.clear(); harness.calls.length = 0; harness.locks.clear(); harness.fail = ""; harness.stale = false; harness.watch = false; harness.hold = null; harness.capturedAt = null; });

test("five distinct role characters use the verified unified model", () => {
  assert.deepEqual(ANALYSTS.map((item) => item.model), Array(5).fill("gpt-6.1-sol"));
  assert.equal(new Set(ANALYSTS.map((item) => item.name)).size, 5);
  assert.equal(reportSchema.safeParse({ ...report, hiddenThinking: "not allowed" }).success, false);
});
test("Claude transport omits unsupported constraints but retains required keys and strict validation", () => {
  assert.deepEqual(compatibleClaudeSchema({ type: "array", maxItems: 4, items: { type: "string", maxLength: 100 }, additionalProperties: false }), { type: "array", items: { type: "string" }, additionalProperties: false });
  assert.equal(reportSchema.safeParse({ ...report, headline: "x".repeat(121) }).success, false);
});
test("starting and reading records never generate a paid call and never expose sessions", async () => {
  const id = randomUUID(); await startCouncil("hynix", id, "alice");
  for (let i = 0; i < 4; i++) { await readCouncilRun(id); const history = await councilHistory("hynix"); assert.equal(history.length, 1); assert.ok(!("createdBy" in history[0])); assert.ok(!("context" in history[0])); }
  assert.equal(harness.calls.length, 0); assert.equal((await getAiUsage()).totalCalls, 0);
  await startCouncil("hynix", id, "alice"); assert.equal((await councilHistory("hynix")).length, 1);
});
test("five explicit steps produce independent reports followed by a master, without replay charges", async () => {
  const id = randomUUID(); await startCouncil("hynix", id, "alice");
  for (const actor of ANALYSTS) {
    const current = await stepCouncil(id, "alice", false, actor.id);
    assert.equal(current.analysts.find((item) => item.id === actor.id)?.status, "done");
    assert.ok(current.analysts.find((item) => item.id === actor.id)?.report?.findings.every((item) => item.sourceId !== "invented"));
    await stepCouncil(id, "alice", false, actor.id);
  }
  assert.equal(harness.calls.length, 5);
  assert.deepEqual(harness.calls.map((item) => item.model), ANALYSTS.map((item) => item.model));
  assert.ok(harness.calls.slice(0, 4).every((item) => !("ANALYST_REPORTS" in (item.data as any))));
  assert.equal((harness.calls[4].data as any).ANALYST_REPORTS.length, 4);
  const stored = (await readCouncilRun(id))!; assert.equal(stored.status, "complete"); assert.equal(stored.analysts.reduce((sum, actor) => sum + actor.attempts, 0), 5);
  const nextId = randomUUID(); await startCouncil("hynix", nextId, "alice"); await stepCouncil(nextId, "alice", false, "bollinger"); assert.equal(harness.calls.length, 6);
});
test("failed analyst is visible to the master; explicit retry only redoes failed member and master", async () => {
  harness.fail = "체크, 위험";
  const id = randomUUID(); await startCouncil("hynix", id, "alice");
  for (const actor of ANALYSTS) await stepCouncil(id, "alice", false, actor.id);
  assert.equal((await readCouncilRun(id))!.status, "partial");
  const master = (harness.calls.at(-1)!.data as any).ANALYST_REPORTS;
  assert.equal(master.find((item: any) => item.id === "fable").status, "error"); assert.equal(master.find((item: any) => item.id === "fable").report, null);
  harness.fail = ""; const retry = await stepCouncil(id, "alice", true); assert.equal(harness.calls.length, 5); assert.equal(retry.status, "pending");
  await stepCouncil(id, "alice", false, "fable"); await stepCouncil(id, "alice", false, "master");
  assert.equal(harness.calls.length, 7); assert.equal((await readCouncilRun(id))!.status, "complete");
});
test("no usage quota beyond 1000 calls; stale data cannot yield an actionable AI stance", async () => {
  harness.stale = true; const today = (await getAiUsage()).day; harness.write(`ai-budget:${today}`, 1001);
  const id = randomUUID(); await startCouncil("hynix", id, "alice"); const current = await stepCouncil(id, "alice", false, "bollinger");
  assert.equal(current.analysts[0].report?.stance, "INSUFFICIENT"); assert.equal((await getAiUsage()).analysisCalls, 1002); assert.equal((await getAiUsage()).unlimited, true);
});
test("a reader cannot advance another session's paid run, and Bitcoin does not inherit Hynix-only evidence", async () => {
  const id = randomUUID(); const current = await startCouncil("bitcoin", id, "alice");
  await assert.rejects(() => stepCouncil(id, "bob", false, "bollinger"), /RUN_NOT_OWNED/);
  const stored = (await readCouncilRun(id))!; assert.deepEqual(stored.context.news, []); assert.equal(stored.context.annualEstimates, null);
  assert.ok(!("createdBy" in publicRun(stored))); assert.equal(current.assetId, "bitcoin"); assert.equal(harness.calls.length, 0);
});
test("concurrent duplicate steps share a lock and consume one model call", async () => {
  let release!: () => void; harness.hold = new Promise<void>((resolve) => { release = resolve; });
  const id = randomUUID(); await startCouncil("hynix", id, "alice"); const first = stepCouncil(id, "alice", false, "bollinger");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const duplicate = await stepCouncil(id, "alice", false, "bollinger"); assert.equal(duplicate.analysts[0].status, "running");
  release(); await first; assert.equal(harness.calls.length, 1);
});
test("a pre-close captured candle does not become confirmed merely because analysis starts after close", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-13T07:00:00Z") });
  harness.capturedAt = "2026-10-13T06:30:00Z";
  const id = randomUUID(); const current = await startCouncil("hynix", id, "alice");
  assert.equal(current.dailyBarTime, "2026-10-12");
  assert.equal((await readCouncilRun(id))!.context.closedBars.at(-1)!.time, "2026-10-12");
  assert.equal(harness.calls.length, 0);
});

test("read-only history expires an orphaned legacy Fable call without replaying or losing completed reports", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-13T07:00:00Z") });
  const id = randomUUID(); await startCouncil("hynix", id, "alice");
  for (const actor of ANALYSTS.slice(0, 3)) await stepCouncil(id, "alice", false, actor.id);
  const stored = (await readCouncilRun(id))!;
  const actor = stored.analysts[3]; actor.status = "running"; actor.model = "claude-fable-5-1"; actor.startedAt = new Date().toISOString(); actor.attempts = 1; stored.status = "running";
  harness.write(`council-run:${id}`, stored); t.mock.timers.tick(ANALYST_DEADLINE_MS + 1);
  const history = await councilHistory("hynix");
  assert.equal(history[0].analysts[3].status, "error"); assert.ok(history[0].analysts[3].error?.includes("자동 재호출하지"));
  assert.equal(history[0].analysts[0].status, "done"); assert.equal(harness.calls.length, 3);
  assert.ok(!("revision" in history[0]));
  const retry = await stepCouncil(id, "alice", true);
  assert.equal(retry.analysts[3].model, "gpt-6.1-sol"); assert.equal(harness.calls.length, 3);
  await stepCouncil(id, "alice", false, "fable"); await stepCouncil(id, "alice", false, "master");
  assert.equal((await readCouncilRun(id))!.status, "complete"); assert.equal(harness.calls.length, 5);
});

test("late response cannot overwrite recovered status or a new attempt's lock", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-13T07:00:00Z") });
  let release!: () => void; harness.hold = new Promise<void>((resolve) => { release = resolve; });
  const id = randomUUID(); await startCouncil("hynix", id, "alice");
  const first = stepCouncil(id, "alice", false, "bollinger");
  await new Promise((resolve) => setTimeout(resolve, 20));
  t.mock.timers.tick(ANALYST_DEADLINE_MS + 1);
  const recovered = (await readCouncilRun(id))!; assert.equal(recovered.analysts[0].status, "error");
  const newLease = Date.now() + 130000; harness.locks.set(`council:${id}`, newLease);
  release(); const late = await first;
  assert.equal(late.analysts[0].status, "error"); assert.equal(late.analysts[0].report, null);
  assert.equal(harness.locks.get(`council:${id}`), newLease); assert.equal(harness.calls.length, 1);
});

test("expired lock alone never replays a still-live paid attempt", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-13T07:00:00Z") });
  let release!: () => void; harness.hold = new Promise<void>((resolve) => { release = resolve; });
  const id = randomUUID(); await startCouncil("hynix", id, "alice"); const first = stepCouncil(id, "alice", false, "bollinger");
  await new Promise((resolve) => setTimeout(resolve, 20)); t.mock.timers.tick(130001);
  const duplicate = await stepCouncil(id, "alice", false, "bollinger"); assert.equal(duplicate.analysts[0].status, "running");
  release(); await first; assert.equal(harness.calls.length, 1);
});

test("master selection is validated, persisted and returned as a distinct conditional price plan", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-13T06:00:00Z") }); harness.capturedAt = new Date().toISOString();
  const id = randomUUID(); await startCouncil("hynix", id, "alice");
  for (const actor of ANALYSTS) await stepCouncil(id, "alice", false, actor.id);
  const stored = (await readCouncilRun(id))!;
  assert.equal(stored.tradePlan!.action, "BUY"); assert.equal(stored.tradePlan!.candidate!.id, "buy-support");
  assert.equal(stored.tradePlan!.candidate!.trigger.price, stored.context.dailyTechnical.support);
  assert.equal(stored.context.asset.signal.side, "WAIT", "AI selection must not rewrite confirmed technical signals");
  assert.equal((await councilHistory("hynix"))[0].tradePlan!.action, "BUY"); assert.equal(harness.calls.length, 5);
});

test("stale master selection is forced to HOLD with no invented actionable prices", async () => {
  harness.stale = true;
  const id = randomUUID(); await startCouncil("hynix", id, "alice");
  for (const actor of ANALYSTS) await stepCouncil(id, "alice", false, actor.id);
  const stored = (await readCouncilRun(id))!;
  assert.equal(stored.tradePlan!.action, "HOLD"); assert.equal(stored.tradePlan!.candidate, null); assert.equal(harness.calls.length, 5);
  assert.equal(stored.analysts[4].report!.tradeDecision!.action, "HOLD"); assert.ok(stored.analysts[4].report!.headline.includes("보류"));
});

test("captain watch selection persists through step response and public history without extra calls", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-13T06:00:00Z") });
  harness.capturedAt = new Date().toISOString(); harness.watch = true;
  const id = randomUUID(); await startCouncil("hynix", id, "alice");
  for (const actor of ANALYSTS) await stepCouncil(id, "alice", false, actor.id);
  const stored = (await readCouncilRun(id))!;
  assert.equal(stored.tradePlan!.action, "HOLD"); assert.equal(stored.tradePlan!.candidate, null);
  assert.equal(stored.tradePlan!.buyWatch!.selectedBy, "MASTER");
  assert.equal(stored.tradePlan!.buyWatch!.candidate.trigger.price, stored.context.dailyTechnical.support);
  const history = await councilHistory("hynix");
  assert.equal(history[0].tradePlan!.buyWatch!.candidate.id, "buy-support");
  assert.equal("context" in history[0], false); assert.equal(harness.calls.length, 5);
});
