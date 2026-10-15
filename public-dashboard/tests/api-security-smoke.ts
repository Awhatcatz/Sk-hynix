import assert from "node:assert/strict";
const origin = process.env.RADAR_TEST_URL || "http://127.0.0.1:5173";
const key = process.env.RADAR_ACCESS_TOKEN;
if (process.env.RADAR_LINK_ONLY !== "1") assert.ok(key, "Test access capability must be supplied in environment, never source");
for (const path of ["markets", "quotes", "briefing", "research", "council"]) {
  const response = await fetch(`${origin}/api/${path}`);
  assert.equal(response.status, 401, `${path} must reject anonymous reads`);
  assert.equal((await response.json() as any).assets, undefined);
}
assert.equal((await fetch(origin + "/api/chat", { method: "POST" })).status, 401);
assert.equal((await fetch(origin + "/api/council", { method: "POST" })).status, 401);
assert.equal((await fetch(origin + "/api/briefing", { method: "POST", headers: { Origin: origin } })).status, 401);
const mcp = await fetch(origin + "/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_market_radar" } }) });
if (mcp.status === 200) assert.equal((await mcp.json() as any).result.isError, true);
else assert.ok([401, 403].includes(mcp.status), "Native Sites MCP authorization must reject anonymous calls");
const spoof = await fetch(origin + "/api/markets", { headers: { "oai-authenticated-user-email": "seedy@sites.test", "oai-authenticated-user-id": "local_seedy" } });
assert.equal(spoof.status, 401);
const crossOrigin = await fetch(origin + "/api/access", { method: "POST", headers: { Origin: "https://invalid.example", "Content-Type": "application/json" }, body: JSON.stringify({ token: key }) });
assert.equal(crossOrigin.status, 403);
const access = process.env.RADAR_LINK_ONLY === "1" ? await fetch(origin + "/api/access") : await fetch(origin + "/api/access", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ token: key }) });
assert.equal(access.status, 200);
const setCookie = access.headers.get("set-cookie")!;
assert.ok(setCookie.includes("HttpOnly")); assert.ok(setCookie.includes("SameSite=Strict"));
const cookie = setCookie.split(";")[0];
const granted = await fetch(origin + "/api/access", { headers: { Cookie: cookie } });
assert.equal((await granted.json() as any).allowed, true);
const tampered = await fetch(origin + "/api/access", { headers: { Cookie: cookie + "x" } });
assert.equal((await tampered.json() as any).allowed, process.env.RADAR_LINK_ONLY === "1");
assert.equal((await fetch(origin + "/api/markets", { headers: { Cookie: cookie + "x" } })).status, 401, "Tampered session must not pass data-route verification");
if (process.env.RADAR_LINK_ONLY === "1") {
  const anonymous = await fetch(origin + "/api/access");
  assert.equal((await anonymous.json() as any).allowed, true);
  assert.ok(anonymous.headers.get("set-cookie")?.includes("HttpOnly"), "Base-link visitors enter without login");
}
const chatCross = await fetch(origin + "/api/chat", { method: "POST", headers: { Cookie: cookie, Origin: "https://invalid.example", "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "x" }] }) });
assert.equal(chatCross.status, 403);
for (const headers of [new Headers({ Cookie: cookie, Origin: "https://invalid.example" }), new Headers({ Cookie: cookie })]) {
  const blocked = await fetch(origin + "/api/briefing", { method: "POST", headers });
  assert.equal(blocked.status, 403, "AI analysis requires same-origin action");
  assert.equal((await fetch(origin + "/api/council", { method: "POST", headers })).status, 403);
}
const historyBefore = await fetch(origin + "/api/council?asset=hynix", { headers: { Cookie: cookie } }).then((response) => response.json()) as any;
assert.equal(historyBefore.usage.unlimited, true);
for (let i = 0; i < 3; i++) {
  const current = await fetch(origin + "/api/council?asset=hynix", { headers: { Cookie: cookie } }).then((response) => response.json()) as any;
  assert.equal(current.usage.totalCalls, historyBefore.usage.totalCalls);
  assert.ok((current.history || []).every((run: any) => !run.context && !run.createdBy), "Internal context and session must not leak");
}
const readAnalysis = async () => {
  const response = await fetch(origin + "/api/briefing", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return await response.json() as { usage: { used: number }; outcome: string };
};
const beforeReads = await readAnalysis();
for (let i = 0; i < 3; i++) {
  const read = await readAnalysis();
  assert.ok(["stored", "idle"].includes(read.outcome), "Reads must not initiate generation");
  assert.equal(read.usage.used, beforeReads.usage.used, "Reading an absent/expired briefing must not charge a call");
}
console.log(JSON.stringify({ apiGate: "pass", mcpGate: "pass", csrf: "pass", signedHttpOnlyCookie: "pass", readOnlyAnalysis: "pass" }));
