import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { Briefing, Snapshot } from "../lib/radar-types";

type CacheEntry = { value: unknown; updatedAt: number };
const harness = {
  cache: new Map<string, CacheEntry>(), locks: new Set<string>(),
  env: { BAZE_API_KEY: "test-only-provider-key", BAZE_MODEL: "TEST" },
  onLock: null as (() => void) | null,
  read(key: string) { return this.cache.get(key) || null; },
  write(key: string, value: unknown) { this.cache.set(key, { value, updatedAt: Date.now() }); },
  lock(key: string) { if (this.locks.has(key)) return false; this.locks.add(key); this.onLock?.(); return true; },
  db: { prepare(sql: string) {
    assert.ok(sql.startsWith("INSERT INTO radar_cache"));
    assert.ok(!sql.includes("WHERE"), "Usage must not impose a quota");
    return { bind(key: string, now: number) {
      return { async run() {
        const used = Number(harness.read(key)?.value) || 0;
        harness.cache.set(key, { value: used + 1, updatedAt: now });
        return { meta: { changes: 1 } };
      } };
    } };
  } },
};
const globals = globalThis as typeof globalThis & { __briefingTest?: typeof harness };
globals.__briefingTest = harness;

// Test-only module hooks exercise the real trigger/cache logic without Worker bindings or paid calls.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers") return { url: "briefing-test:env", shortCircuit: true };
    if (context.parentURL?.includes("/lib/") && specifier === "./radar-store") return { url: "briefing-test:store", shortCircuit: true };
    if (context.parentURL?.endsWith("/lib/radar.ts")) {
      if (["./market-provider", "./research"].includes(specifier)) return { url: "briefing-test:providers", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const sources: Record<string, string> = {
      "briefing-test:env": "export const env = globalThis.__briefingTest.env;",
      "briefing-test:store": `const h = globalThis.__briefingTest;
        export const readCache = async key => h.read(key);
        export const writeCache = async (key, value) => h.write(key, value);
        export const acquireLock = async key => h.lock(key);
        export const releaseLock = async key => h.locks.delete(key);
        export const database = () => h.db;
        export const eventHistory = async () => [];
        export const saveEvents = async () => {};`,
      "briefing-test:providers": `const unavailable = () => { throw new Error("Unexpected market request in cached test"); };
        export const fetchAsset = unavailable, fetchMacro = unavailable, fetchNews = unavailable, getResearch = unavailable;`,
    };
    return sources[url] ? { format: "module", source: sources[url], shortCircuit: true } : next(url, context);
  },
});
const { getBriefing, getBriefingState, analyzeBriefing } = await import("../lib/radar");
after(() => { hooks.deregister(); delete globals.__briefingTest; });
const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const briefing: Briefing = { generatedAt: "2026-10-01T00:00:00Z", model: "TEST", status: "ready", headline: "Stored test analysis",
  summary: "Test evidence", regime: "MIXED", hynixInsight: "", watchpoints: [], assetNotes: [], newsNotes: [], sourcesAsOf: "2026-10-01T00:00:00Z", warnings: [] };
const result = { ...briefing, researchNotes: [] };
const providerResponse = () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }] });
const saveOld = () => harness.cache.set("briefing:v3", { value: briefing, updatedAt: Date.now() - 3 * 3600000 });
beforeEach(() => {
  harness.cache.clear(); harness.locks.clear(); harness.onLock = null;
  harness.env.BAZE_API_KEY = "test-only-provider-key";
  harness.write("markets:v3", { generatedAt: new Date().toISOString(), assets: [{ id: "hynix", price: 100, stale: false, candles: [] }],
    macro: [], news: [], events: [], warnings: [], methodologyVersion: "TEST" });
});

test("reads of missing analysis never call a provider, collect markets or acquire a lock", async (t) => {
  harness.cache.clear();
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Paid call on read"); });
  for (let i = 0; i < 5; i++) {
    assert.equal(await getBriefing(), null);
    const state = await getBriefingState();
    assert.equal(state.outcome, "idle"); assert.equal(state.usage.used, 0);
  }
  assert.equal(fetch.mock.callCount(), 0); assert.equal(harness.locks.size, 0); assert.equal(harness.cache.size, 0);
});
test("reads preserve an expired analysis without regenerating it", async (t) => {
  saveOld();
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Paid call on read"); });
  assert.deepEqual(await getBriefing(), briefing);
  const state = await getBriefingState();
  assert.equal(state.outcome, "stored"); assert.equal(state.briefing?.generatedAt, briefing.generatedAt);
  assert.equal(fetch.mock.callCount(), 0); assert.equal(state.usage.used, 0);
});
test("every explicit analysis makes a fresh call; reads never call", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => providerResponse());
  const generated = await analyzeBriefing();
  assert.equal(generated.outcome, "generated"); assert.equal(generated.usage.used, 1);
  assert.equal(generated.briefing?.status, "ready");
  assert.equal((await getBriefingState()).usage.used, 1);
  assert.equal((await analyzeBriefing()).outcome, "generated");
  assert.equal(fetch.mock.callCount(), 2); assert.equal(harness.locks.size, 0);
});
test("in-progress shared analysis does not create another paid call", async (t) => {
  saveOld(); harness.locks.add("ai-briefing");
  const fetch = t.mock.method(globalThis, "fetch", async () => providerResponse());
  const state = await analyzeBriefing();
  assert.equal(state.outcome, "pending"); assert.deepEqual(state.briefing, briefing);
  assert.equal(state.usage.used, 0); assert.equal(fetch.mock.callCount(), 0);
});
test("recent results do not block a new explicit analysis", async (t) => {
  saveOld(); harness.onLock = () => harness.write("briefing:v3", briefing);
  const fetch = t.mock.method(globalThis, "fetch", async () => providerResponse());
  assert.equal((await analyzeBriefing()).outcome, "generated");
  assert.equal(fetch.mock.callCount(), 1); assert.equal(harness.locks.size, 0);
});
test("there is no daily cap even beyond 1000 calls", async (t) => {
  saveOld(); harness.write(`ai-budget:${day()}`, 1001);
  const fetch = t.mock.method(globalThis, "fetch", async () => providerResponse());
  const state = await analyzeBriefing();
  assert.equal(state.outcome, "generated");
  assert.deepEqual(state.usage, { day: day(), used: 1002, limit: null, unlimited: true }); assert.equal(fetch.mock.callCount(), 1);
});
test("missing provider credentials do not consume a call", async (t) => {
  harness.env.BAZE_API_KEY = "";
  const fetch = t.mock.method(globalThis, "fetch", async () => providerResponse());
  const state = await analyzeBriefing();
  assert.equal(state.outcome, "unavailable"); assert.equal(state.usage.used, 0); assert.equal(fetch.mock.callCount(), 0);
});
test("all-stale market data does not consume a call", async (t) => {
  const snapshot = harness.read("markets:v3")!.value as Snapshot;
  snapshot.assets[0].stale = true;
  const fetch = t.mock.method(globalThis, "fetch", async () => providerResponse());
  const state = await analyzeBriefing();
  assert.equal(state.outcome, "unavailable"); assert.equal(state.usage.used, 0); assert.equal(fetch.mock.callCount(), 0);
});
test("provider failure is counted; explicit retries have no backoff quota", async (t) => {
  saveOld();
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Test provider outage"); });
  const failed = await analyzeBriefing();
  assert.equal(failed.outcome, "unavailable"); assert.deepEqual(failed.briefing, briefing); assert.equal(failed.usage.used, 1);
  assert.equal((await getBriefingState()).usage.used, 1);
  assert.equal((await analyzeBriefing()).outcome, "unavailable");
  assert.equal(fetch.mock.callCount(), 2); assert.equal(harness.locks.size, 0);
});
test("simultaneous clicks share the generation lock and consume one call", async (t) => {
  let complete: (() => void) | undefined;
  const held = new Promise<void>((resolve) => { complete = resolve; });
  const fetch = t.mock.method(globalThis, "fetch", async () => { await held; return providerResponse(); });
  const first = analyzeBriefing();
  const second = await analyzeBriefing();
  assert.equal(second.outcome, "pending");
  complete!(); const finished = await first;
  assert.equal(finished.outcome, "generated"); assert.equal(finished.usage.used, 1); assert.equal(fetch.mock.callCount(), 1);
});
