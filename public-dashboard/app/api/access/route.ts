import { env } from "cloudflare:workers";
import { accessSession, privateHeaders, sameOrigin } from "../../../lib/access";
import { secretMatches, signAccess } from "../../../lib/access-token";
import { acquireLock } from "../../../lib/radar-store";

export async function GET(request: Request) {
  if (await accessSession(request)) return Response.json({ allowed: true }, { headers: privateHeaders });
  if (env.DASHBOARD_LINK_ONLY === "true") {
    if (!env.DASHBOARD_ACCESS_KEY || env.DASHBOARD_ACCESS_KEY.length < 32) return Response.json({ error: "서버 연결 설정 확인이 필요합니다." }, { status: 503, headers: privateHeaders });
    const cookie = await signAccess(env.DASHBOARD_ACCESS_KEY);
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return Response.json({ allowed: true }, { headers: { ...privateHeaders, "Set-Cookie": `radar_access=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}` } });
  }
  return Response.json({ allowed: false }, { headers: privateHeaders });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403, headers: privateHeaders });
  if (!env.DASHBOARD_ACCESS_KEY || env.DASHBOARD_ACCESS_KEY.length < 32) return Response.json({ error: "접근 설정 확인이 필요합니다." }, { status: 503, headers: privateHeaders });
  if (Number(request.headers.get("content-length")) > 512) return new Response(null, { status: 413, headers: privateHeaders });
  const input = await request.text();
  if (input.length > 512) return new Response(null, { status: 413, headers: privateHeaders });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(request.headers.get("cf-connecting-ip") || "anonymous"));
  const ip = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  if (!await acquireLock(`access-attempt:${ip}`, 1000)) return new Response(null, { status: 429, headers: privateHeaders });
  let token = "";
  try { token = JSON.parse(input).token; } catch { /* Invalid input is denied. */ }
  if (typeof token !== "string" || !await secretMatches(token, env.DASHBOARD_ACCESS_KEY)) return Response.json({ error: "공유 링크가 유효하지 않습니다." }, { status: 401, headers: privateHeaders });
  const cookie = await signAccess(env.DASHBOARD_ACCESS_KEY);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return Response.json({ allowed: true }, { headers: { ...privateHeaders, "Set-Cookie": `radar_access=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}` } });
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  return Response.json({ allowed: false }, { headers: { ...privateHeaders, "Set-Cookie": "radar_access=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure" } });
}
