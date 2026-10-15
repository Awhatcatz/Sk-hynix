import { analyzeBriefing, getBriefingState } from "../../../lib/radar";
import { accessSession, denied, privateHeaders, sameOrigin } from "../../../lib/access";
export async function GET(request: Request) {
  if (!await accessSession(request)) return denied();
  try { return Response.json(await getBriefingState(), { headers: privateHeaders }); }
  catch { return Response.json({ error: "저장된 AI 분석을 불러오지 못했습니다." }, { status: 503, headers: privateHeaders }); }
}
export async function POST(request: Request) {
  if (!await accessSession(request)) return denied();
  if (!sameOrigin(request)) return Response.json({ error: "동일 사이트에서만 AI 분석을 실행할 수 있습니다." }, { status: 403, headers: privateHeaders });
  try { return Response.json(await analyzeBriefing(), { headers: privateHeaders }); }
  catch { return Response.json({ error: "AI 분석 요청을 처리하지 못했습니다. 자동 재시도하지 않습니다." }, { status: 503, headers: privateHeaders }); }
}
