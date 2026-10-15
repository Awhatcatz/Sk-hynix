import { accessSession, denied, privateHeaders, sameOrigin } from "../../../lib/access";
import { councilInput, COUNCIL_ASSETS, publicRun, type CouncilAssetId } from "../../../lib/council-contract";
import { councilHistory, getAiUsage, readCouncilRun, startCouncil, stepCouncil } from "../../../lib/council";
import { z } from "zod";

const failure = (error: string, status: number) => Response.json({ error }, { status, headers: privateHeaders });
export async function GET(request: Request) {
  if (!await accessSession(request)) return denied();
  const params = new URL(request.url).searchParams, id = params.get("id");
  try {
    if (id) {
      if (!z.string().uuid().safeParse(id).success) return failure("분석 기록 ID를 확인하세요.", 400);
      const run = await readCouncilRun(id);
      return run ? Response.json({ run: publicRun(run), usage: await getAiUsage() }, { headers: privateHeaders }) : failure("분석 기록을 찾지 못했습니다.", 404);
    }
    const asset = params.get("asset") || "hynix";
    if (!COUNCIL_ASSETS.includes(asset as CouncilAssetId)) return failure("분석 대상을 확인하세요.", 400);
    return Response.json({ history: await councilHistory(asset as CouncilAssetId), usage: await getAiUsage() }, { headers: privateHeaders });
  } catch { return failure("분석 기록 조회가 지연됐습니다.", 503); }
}
export async function POST(request: Request) {
  const session = await accessSession(request); if (!session) return denied();
  if (!sameOrigin(request)) return failure("동일 사이트에서만 분석을 실행할 수 있습니다.", 403);
  const raw = await request.text(); if (raw.length > 2000) return failure("요청이 너무 큽니다.", 413);
  let input;
  try { input = councilInput.safeParse(JSON.parse(raw)); } catch { return failure("요청 형식을 확인하세요.", 400); }
  if (!input.success) return failure("분석 대상과 요청 ID를 확인하세요.", 400);
  if (input.data.action === "step") {
    const action = input.data;
    const initial = await readCouncilRun(action.runId);
    if (!initial) return failure("분석 기록을 찾지 못했습니다.", 404);
    if (initial.createdBy !== session) return failure("다른 사용자의 기록은 읽기만 가능합니다. 새 분석을 시작하세요.", 403);
    // JSON whitespace heartbeats keep an idle proxy from dropping long model calls.
    const encoder = new TextEncoder();
    let closed = false, heartbeat: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (text: string) => { if (!closed) controller.enqueue(encoder.encode(text)); };
        send(" "); heartbeat = setInterval(() => send("\n"), 5000);
        void (async () => {
          try { send(JSON.stringify({ run: await stepCouncil(action.runId, session, false, action.analystId), usage: await getAiUsage() })); }
          catch { send(JSON.stringify({ error: "분석 연결이 끊겼습니다. 저장된 상태를 조회하며 자동 재호출하지 않습니다." })); }
          finally { clearInterval(heartbeat); if (!closed) { closed = true; controller.close(); } }
        })();
      },
      cancel() { closed = true; clearInterval(heartbeat); },
    });
    return new Response(stream, { headers: { ...privateHeaders, "Content-Type": "application/json; charset=utf-8", "X-Accel-Buffering": "no" } });
  }
  try {
    const action = input.data;
    const run = action.action === "start" ? await startCouncil(action.assetId, action.requestId, session) : await stepCouncil(action.runId, session, true);
    return Response.json({ run, usage: await getAiUsage() }, { headers: privateHeaders });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    return failure(code === "RUN_NOT_OWNED" ? "다른 사용자의 기록은 읽기만 가능합니다. 새 분석을 시작하세요." : "분석 요청이 지연됐습니다. 자동으로 다시 호출하지 않습니다.", code === "RUN_NOT_OWNED" ? 403 : code === "RUN_NOT_FOUND" ? 404 : 503);
  }
}
