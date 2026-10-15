import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const h = { owner: "reader", hold: null as Promise<void> | null, calls: 0 };
const globals = globalThis as typeof globalThis & { __councilRoute?: typeof h }; globals.__councilRoute = h;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/app/api/council/route.ts")) {
      if (specifier.endsWith("/access")) return { url: "council-route:access", shortCircuit: true };
      if (specifier.endsWith("/council")) return { url: "council-route:service", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const source = url === "council-route:access" ? `export const accessSession=async()=> 'reader';export const sameOrigin=req=>req.headers.get('origin')===new URL(req.url).origin;export const privateHeaders={'Cache-Control':'private, no-store'};export const denied=()=>Response.json({error:'denied'},{status:401});`
      : url === "council-route:service" ? `const h=globalThis.__councilRoute;export const readCouncilRun=async id=>({id,createdBy:h.owner});export const stepCouncil=async id=>{h.calls++;if(h.hold)await h.hold;return {id,status:'complete'};};export const getAiUsage=async()=>({totalCalls:h.calls});export const councilHistory=async()=>[];export const startCouncil=async()=>null;` : null;
    return source ? { format: "module", source, shortCircuit: true } : next(url, context);
  },
});
const { POST } = await import("../app/api/council/route");
after(() => { hooks.deregister(); delete globals.__councilRoute; });
beforeEach(() => { h.owner = "reader"; h.hold = null; h.calls = 0; });
const request = () => new Request("https://test.example/api/council", { method: "POST", headers: { Origin: "https://test.example" }, body: JSON.stringify({ action: "step", runId: "541a835a-cb9a-4e3d-853c-b0d915fc4f75", analystId: "fable" }) });
test("long model steps send early heartbeat bytes and finish as valid JSON", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let release!: () => void; h.hold = new Promise<void>((resolve) => { release = resolve; });
  const response = await POST(request()); assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  let body = decoder.decode((await reader.read()).value); assert.equal(body, " ");
  t.mock.timers.tick(5001); body += decoder.decode((await reader.read()).value); assert.equal(body, " \n");
  release();
  for (;;) { const chunk = await reader.read(); if (chunk.done) break; body += decoder.decode(chunk.value); }
  assert.equal(JSON.parse(body).run.status, "complete"); assert.equal(h.calls, 1);
});
test("ownership failure retains HTTP 403 and never starts a stream or a model", async () => {
  h.owner = "different-reader"; assert.equal((await POST(request())).status, 403); assert.equal(h.calls, 0);
});
test("reader disconnect clears heartbeat and never replays the model", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let release!: () => void; h.hold = new Promise<void>((resolve) => { release = resolve; });
  const response = await POST(request()); const reader = response.body!.getReader(); await reader.read(); await reader.cancel();
  t.mock.timers.tick(10000); release(); await new Promise((resolve) => setTimeout(resolve, 0)); assert.equal(h.calls, 1);
});
