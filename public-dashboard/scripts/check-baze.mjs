import { registerHooks } from "node:module";
import readline from "node:readline";
import { once } from "node:events";
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const lines = readline.createInterface({ input: process.stdin, terminal: false });
console.log("Ready for provider verification configuration on stdin");
const [line] = await once(lines, "line"); lines.close();
const input = JSON.parse(line), cache = new Map();
globalThis.__providerCheck = { env: { BAZE_API_KEY: input.apiKey }, cache };
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers") return { url: "check-baze:env", shortCircuit: true };
    if (context.parentURL?.endsWith("/lib/baze-provider.ts") && specifier === "./radar-store") return { url: "check-baze:store", shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    const sources = { "check-baze:env": "export const env=globalThis.__providerCheck.env;", "check-baze:store": "export const readCache=async key=>globalThis.__providerCheck.cache.get(key)||null;export const writeCache=async (key,value)=>globalThis.__providerCheck.cache.set(key,{value,updatedAt:Date.now()});" };
    return sources[url] ? { format: "module", source: sources[url], shortCircuit: true } : next(url, context);
  },
});
try {
  const { availableBazeModels, generateAnalystReport } = await import("../lib/baze-provider.ts");
  const available = await availableBazeModels();
  console.log(JSON.stringify({ requested: input.models.map((id) => ({ id, available: available.includes(id) })) }));
  if (input.generate) {
    for (const model of input.models) {
      try {
        const result = await generateAnalystReport(model, "API 연결 시험이다. 주어진 자료만 한국어로 짧게 요약한다. 다른 사실을 만들지 않는다. findings의 sourceId는 daily이며 모든 필요한 JSON 필드를 채운다. agreements와 disagreements는 빈 배열이다.", { asset: "TEST", daily: { close: 100, ma5: 99, ma20: 98 }, asOf: "2026-10-13", stale: false });
        console.log(JSON.stringify({ model, success: true, stance: result.report.stance, tokens: result.tokens }));
      } catch (error) { console.log(JSON.stringify({ model, success: false, error: error.name, status: error.statusCode, message: String(error.message).slice(0, 220), detail: String(error.responseBody || "").replaceAll(input.apiKey, "[REDACTED]").slice(0, 1500) })); process.exitCode = 1; }
    }
  }
} finally { hooks.deregister(); delete globalThis.__providerCheck; }
