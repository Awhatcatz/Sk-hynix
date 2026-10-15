import { getQuotes } from "../../../lib/quotes";
import { accessSession, denied, privateHeaders } from "../../../lib/access";
export async function GET(request: Request) {
  if (!await accessSession(request)) return denied();
  try { return Response.json(await getQuotes(), { headers: privateHeaders }); }
  catch { return Response.json({ error: "시세 갱신 대기" }, { status: 503 }); }
}
