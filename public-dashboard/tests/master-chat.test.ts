import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { ANALYSTS, type StoredCouncilRun } from "../lib/council-contract";

const h = { run: null as StoredCouncilRun | null, calls: [] as any[], quotes: [] as any[], usage: 0, locked: false };
const globals = globalThis as typeof globalThis & { __masterChat?: typeof h }; globals.__masterChat = h;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/app/api/chat/route.ts")) {
      const id = specifier === "cloudflare:workers" ? "env" : specifier.split("/").at(-1);
      if (["env", "access", "radar-store", "ai-usage", "council", "radar", "quotes", "valuation"].includes(id!)) return { url: `master-chat:${id}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const sources: Record<string, string> = {
      "master-chat:env": `export const env={BAZE_API_KEY:'test-key',BAZE_MODEL:'do-not-use-env-model'};`,
      "master-chat:access": `export const accessSession=async()=> 'test-session';export const sameOrigin=req=>req.headers.get('origin')===new URL(req.url).origin;export const privateHeaders={'Cache-Control':'no-store'};export const denied=()=>Response.json({error:'denied'},{status:401});`,
      "master-chat:radar-store": `const h=globalThis.__masterChat;export const acquireLock=async()=>{if(h.locked)return false;h.locked=true;return true;};export const releaseLock=async()=>{h.locked=false;};`,
      "master-chat:ai-usage": `const h=globalThis.__masterChat;export const recordAiCall=async()=>{h.usage++;};export const getAiUsage=async()=>({totalCalls:h.usage,unlimited:true});`,
      "master-chat:council": `export const readCouncilRun=async()=>globalThis.__masterChat.run;`,
      "master-chat:radar": `export const getSnapshot=async()=>({generatedAt:'2026-10-13T02:00:00Z',assets:[],macro:[],research:{privateHynixResearch:true},news:[{title:'Hynix-only news'}],warnings:[]});`,
      "master-chat:quotes": `export const getQuotes=async()=>({generatedAt:new Date().toISOString(),quotes:globalThis.__masterChat.quotes});`,
      "master-chat:valuation": `export const ANNUAL_ESTIMATES=[];`,
    };
    return sources[url] ? { format: "module", source: sources[url], shortCircuit: true } : next(url, context);
  },
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, init) => {
  h.calls.push(JSON.parse(String(init?.body)));
  return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Master follow-up reply" }] }] });
};
const { POST } = await import("../app/api/chat/route");
after(() => { hooks.deregister(); globalThis.fetch = originalFetch; delete globals.__masterChat; });
beforeEach(() => { h.run = null; h.calls.length = 0; h.quotes.length = 0; h.usage = 0; h.locked = false; });
const request = (extra: object = {}) => new Request("https://test.example/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://test.example" }, body: JSON.stringify({ analysisRunId: "541a835a-cb9a-4e3d-853c-b0d915fc4f75", assetId: "hynix", messages: [{ role: "user", content: "Which risk invalidates your briefing?" }], ...extra }) });
function completedRun() {
  h.run = { id: "541a835a-cb9a-4e3d-853c-b0d915fc4f75", assetId: "hynix", assetName: "SK Hynix", createdAt: "2026-10-13T01:00:00Z", context: {}, sources: [{ title: "Daily source", url: "https://example.com/daily", date: "2026-10-12" }], analysts: ANALYSTS.map((actor) => ({ id: actor.id, model: actor.model, status: "done", report: { headline: actor.id, summary: "Saved master conclusion" } })) } as StoredCouncilRun;
}
test("unfinished master cannot generate a paid chat request", async () => {
  completedRun(); h.run!.analysts[4].status = "running";
  assert.equal((await POST(request())).status, 409); assert.equal(h.calls.length, 0); assert.equal(h.usage, 0); assert.equal(h.locked, false);
});
test("chat continues stored master persona and model, with all role reports and prior conversation", async () => {
  completedRun();
  const messages = [{ role: "user", content: "First question" }, { role: "assistant", content: "Earlier reply" }, { role: "user", content: "Follow-up question" }];
  const response = await POST(request({ messages })); const data = await response.json() as { model: string; analysisRunId: string };
  assert.equal(response.status, 200); assert.equal(data.model, "gpt-6.1-sol"); assert.equal(data.analysisRunId, h.run!.id);
  assert.equal(h.calls[0].model, h.run!.analysts[4].model); assert.deepEqual(h.calls[0].input, messages);
  assert.ok(h.calls[0].instructions.includes("캡틴")); assert.ok(h.calls[0].instructions.includes('"masterBriefing"')); assert.ok(h.calls[0].instructions.includes("Saved master conclusion"));
  assert.equal(h.usage, 1); assert.equal(h.locked, false);
});
test("asset mismatch is rejected before any paid call", async () => {
  completedRun(); assert.equal((await POST(request({ assetId: "bitcoin" }))).status, 400); assert.equal(h.calls.length, 0);
});
test("Bitcoin follow-up cannot inherit fresh Hynix-only research and estimates", async () => {
  completedRun(); h.run!.assetId = "bitcoin"; h.run!.assetName = "Bitcoin";
  assert.equal((await POST(request({ assetId: "bitcoin" }))).status, 200);
  const context = JSON.parse(h.calls[0].instructions.split("MARKET_DATA:\n")[1]);
  assert.equal(context.research, null); assert.equal(context.annualEstimates, null); assert.deepEqual(context.news, []);
});

test("expired trade scenarios are supplied to follow-up chat as HOLD, never as a current BUY", async () => {
  completedRun(); h.run!.tradePlan = { action: "BUY", candidate: null, reason: "Old buy", asOf: "2000-01-01T00:00:00Z", validUntil: "2000-01-02T00:00:00Z", dailyBarTime: "2000-01-01", referencePrice: 100, referenceTime: "2000-01-01", unit: "원" };
  assert.equal((await POST(request())).status, 200);
  const context = JSON.parse(h.calls[0].instructions.split("MARKET_DATA:\n")[1]);
  assert.equal(context.selectedAnalysis.validatedTradePlan.action, "HOLD"); assert.equal(context.selectedAnalysis.validatedTradePlan.candidate, null);
  assert.ok(h.calls[0].instructions.includes("임의의 매수가/목표가를 만들지 않는다")); assert.equal(h.usage, 1);
});

test("chat receives the exact validated watch while keeping HOLD; missing quotes remove it", async () => {
  completedRun(); const now = new Date().toISOString();
  const candidate = { id: "buy-support", action: "BUY" as const, name: "Watch", trigger: { price: 120000, comparator: "AT_OR_BELOW" as const, basis: "Support" }, target: { price: 140000, comparator: "AT_OR_ABOVE" as const, basis: "Resistance" }, invalidation: { price: 110000, comparator: "CLOSE_BELOW" as const, basis: "ATR" }, confirmation: "Confirmed rebound required", riskReward: 2 };
  h.run!.tradePlan = { action: "HOLD", candidate: null, buyWatch: { candidate, selectedBy: "MASTER" }, reason: "Wait", asOf: now, validUntil: new Date(Date.now() + 3600000).toISOString(), dailyBarTime: now.slice(0, 10), referencePrice: 125000, referenceTime: now, unit: "원" };
  h.quotes.push({ id: "hynix", price: 125000, stale: false, quoteTime: now });
  assert.equal((await POST(request())).status, 200);
  let context = JSON.parse(h.calls.at(-1).instructions.split("MARKET_DATA:\n")[1]);
  assert.equal(context.selectedAnalysis.validatedTradePlan.action, "HOLD");
  assert.equal(context.selectedAnalysis.validatedTradePlan.buyWatch.candidate.trigger.price, 120000);
  assert.ok(h.calls.at(-1).instructions.includes("관찰 가격은 현재 BUY 신호가 아니다"));
  h.quotes.length = 0;
  assert.equal((await POST(request())).status, 200);
  context = JSON.parse(h.calls.at(-1).instructions.split("MARKET_DATA:\n")[1]);
  assert.equal(context.selectedAnalysis.validatedTradePlan.buyWatch, null);
});
