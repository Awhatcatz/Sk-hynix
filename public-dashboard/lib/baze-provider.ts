import { env } from "cloudflare:workers";
import { generateText, Output } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { readCache, writeCache } from "./radar-store";
import { masterReportSchema, reportSchema } from "./council-contract";
import { compatibleClaudeSchema } from "./provider-schema";

const BASE = "https://factchat.mindlogic-kr-api.com/v1/gateway";
const modelsSchema = z.object({ data: z.array(z.object({ id: z.string(), type: z.string().optional(), endpoints: z.array(z.string()).optional() })) });
export async function availableBazeModels() {
  if (!env.BAZE_API_KEY) throw new Error("BAZE_NOT_CONFIGURED");
  const saved = await readCache<string[]>("baze-chat-models:v1");
  if (saved && Date.now() - saved.updatedAt < 3600000) return saved.value;
  const response = await fetch(`${BASE}/models/`, { headers: { Authorization: `Bearer ${env.BAZE_API_KEY}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("BAZE_MODEL_CATALOG_UNAVAILABLE");
  const parsed = modelsSchema.parse(await response.json());
  const models = parsed.data.filter((item) => item.type === "llm" && item.endpoints?.includes("/v1/gateway/chat/completions/")).map((item) => item.id);
  await writeCache("baze-chat-models:v1", models); return models;
}
export async function generateAnalystReport(model: string, instructions: string, data: unknown, master = false) {
  const provider = createOpenAICompatible({ name: "baze", baseURL: BASE, apiKey: env.BAZE_API_KEY, supportsStructuredOutputs: true,
    transformRequestBody: (body) => ({ ...body, store: false, ...(model.startsWith("claude-") && body.response_format ? { response_format: compatibleClaudeSchema(body.response_format) } : {}) }),
    fetch: (input, init) => fetch(typeof input === "string" ? input.replace(/\/chat\/completions$/, "/chat/completions/") : input, init),
  });
  const result = await generateText({ model: provider(model), instructions, prompt: JSON.stringify(data),
    output: Output.object({ schema: master ? masterReportSchema : reportSchema, name: "analyst_report" }), maxOutputTokens: 16000, maxRetries: 0,
    abortSignal: AbortSignal.timeout(95000), ...(model.startsWith("gpt-") ? { providerOptions: { baze: { reasoningEffort: "low" } } } : {}) });
  return { report: result.output, tokens: { input: result.usage.inputTokens ?? null, output: result.usage.outputTokens ?? null, total: result.usage.totalTokens ?? null } };
}
