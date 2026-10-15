import { env } from "cloudflare:workers";
import { getSnapshot, getBriefing } from "../../lib/radar";
import { getQuotes } from "../../lib/quotes";

const tools = [{ name: "get_market_radar", description: "Owner-only read of SK hynix and global market quotes and confirmed daily-bar signals.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "refresh_market_radar", description: "Owner-only scheduled market surveillance: refresh shared market snapshot and record signals. Returns only the stored briefing; never triggers paid AI analysis.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }];
export async function POST(request: Request) {
  let payload;
  try { payload = await request.json() as { id?: string | number; method: string; params?: { name?: string } }; }
  catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } }, { status: 400 }); }
  const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: payload.id ?? null, result });
  if (payload.method === "server/discover") return reply({ supportedVersions: ["2026-07-28"], capabilities: { tools: {} } });
  if (payload.method === "initialize") return reply({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "Hynix Market Radar", version: "1.0.0" } });
  if (payload.method === "notifications/initialized") return new Response(null, { status: 204 });
  if (payload.method === "ping") return reply({});
  if (payload.method === "tools/list") return reply({ tools });
  if (payload.method === "tools/call" && tools.some((tool) => tool.name === payload.params?.name)) {
    if (!env.SITE_OWNER_EMAIL || request.headers.get("oai-authenticated-user-email") !== env.SITE_OWNER_EMAIL) {
      return reply({ content: [{ type: "text", text: "Owner authentication required for scheduled refresh." }], isError: true });
    }
    try {
      const [snapshot, quotes] = await Promise.all([getSnapshot(), getQuotes().catch(() => null)]);
      const briefing = payload.params?.name === "refresh_market_radar" ? await getBriefing() : undefined;
      return reply({ content: [{ type: "text", text: JSON.stringify({ generatedAt: snapshot.generatedAt,
        assets: snapshot.assets.map(({ candles, ...asset }) => asset), quotes, research: snapshot.research, events: snapshot.events, warnings: snapshot.warnings, briefing }) }] });
    } catch { return reply({ content: [{ type: "text", text: "Market collection is temporarily unavailable." }], isError: true }); }
  }
  return Response.json({ jsonrpc: "2.0", id: payload.id ?? null, error: { code: -32601, message: "Method not found" } });
}
