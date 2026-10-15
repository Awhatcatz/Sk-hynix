import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value && Date.parse(value) < Date.now() + 86400000, "유효한 과거/오늘 날짜가 필요합니다.");
const sourceUrl = z.string().url().max(2000).refine((value) => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }, "HTTPS 원문 주소가 필요합니다.");
export const evidenceInput = z.object({
  publisher: text(80), title: text(180), published: date, period: text(60),
  kind: z.enum(["ACTUAL", "GUIDANCE", "INDUSTRY_FORECAST", "BROKER_ESTIMATE"]), summary: text(500),
  metrics: z.array(z.object({ name: text(80), value: text(60), unit: text(80) }).strict()).max(6), url: sourceUrl,
}).strict();
export const memoryInput = z.object({ product: text(100), value: z.number().finite().positive().max(100000), unit: z.literal("USD/chip"), observedAt: date, sourceUrl }).strict();
export const researchUpdate = z.discriminatedUnion("action", [
  z.object({ action: z.literal("EVIDENCE"), evidence: evidenceInput, originalVerified: z.literal(true), publicationAllowed: z.literal(true) }).strict(),
  z.object({ action: z.literal("MEMORY"), quotes: z.array(memoryInput).min(1).max(12), publicationAllowed: z.literal(true) }).strict(),
]);
