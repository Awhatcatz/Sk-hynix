import { getSnapshot } from "../../../lib/radar";
import { accessSession, denied, privateHeaders } from "../../../lib/access";
export async function GET(request: Request) {
  if (!await accessSession(request)) return denied();
  try { return Response.json(await getSnapshot(), { headers: privateHeaders }); }
  catch { return Response.json({ error: "시세 수집 또는 저장소 연결 중입니다. 잠시 후 다시 갱신하세요." }, { status: 503 }); }
}
