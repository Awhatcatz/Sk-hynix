import { env } from "cloudflare:workers";
import { verifyAccess } from "./access-token";

export const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
export function isOwner(request: Request) { return !!env.SITE_OWNER_EMAIL && request.headers.get("oai-authenticated-user-email") === env.SITE_OWNER_EMAIL; }
export function sameOrigin(request: Request) { return request.headers.get("origin") === new URL(request.url).origin; }
export async function accessSession(request: Request) {
  // Anonymous sessions can view and analyze; owner-only research editing stays separate.
  if (isOwner(request)) return `owner-${request.headers.get("oai-authenticated-user-id") || "site"}`;
  if (!env.DASHBOARD_ACCESS_KEY || env.DASHBOARD_ACCESS_KEY.length < 32) return null;
  const value = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("radar_access="))?.slice(13);
  return value ? verifyAccess(value, env.DASHBOARD_ACCESS_KEY) : null;
}
export const denied = () => Response.json({ error: "대시보드 링크를 열어 연결을 다시 확인하세요." }, { status: 401, headers: privateHeaders });
