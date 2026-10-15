import { z } from "zod";
import { COUNCIL_ASSETS } from "./council-contract";
export const chatInput = z.object({ analysisRunId: z.string().uuid().optional(), assetId: z.enum(COUNCIL_ASSETS).optional(), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(3000) }).strict()).min(1).max(11) }).strict()
  .refine((data) => data.messages.every((item, index) => item.role === (index % 2 === 0 ? "user" : "assistant")) && data.messages.at(-1)?.role === "user", "대화 순서를 확인하세요.");
export type ChatMessage = z.infer<typeof chatInput>["messages"][number];
