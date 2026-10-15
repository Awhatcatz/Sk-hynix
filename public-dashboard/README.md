# Hynix Market Radar

Link-accessible multi-asset market dashboard without visitor login. No portfolio, cash balance, personal trading
plan, or private parent-folder files are read or published.

## Radar Operations

- `GET /api/markets` refreshes the shared D1 snapshot when its 3-minute cache expires.
- `GET /api/quotes` refreshes shared quotes every 10 seconds with Toss configured,
  otherwise 30 seconds. Quotes never
  mutate daily candles or authorize intraday SMA-cross signals.
- Browser BTC/USD uses the public Coinbase ticker WebSocket with heartbeat,
  reconnect, stale detection and REST fallback. Its change is rolling 24h;
  the Yahoo daily candles and signal history remain separately attributed.
- Samsung shares Korean-market completion rules and the domestic KOSPI risk gate.
- Bollinger bands use technicalindicators, period 20, standard deviation multiplier
  2. They are chart/context indicators, not new automatic entry/exit conditions.
- `GET /api/council` reads saved per-asset analysis and usage only. The manual
  button selects Hynix, Nasdaq, Bitcoin or KOSPI and starts a fresh five-call run:
  Bollinger specialist (Band), MA specialist (Tren), earnings/news specialist
  (Repo), risk/opposition specialist (Check), then a master (Captain) comparing
  their independent reports. All five currently use `gpt-6.1-sol`; their roles
  and evidence differ, not their underlying model.
  The Baze catalog is verified; unavailable models are not silently substituted.
  Reports, sources, observation dates and actual token usage persist in D1.
  Public reports are evidence summaries, not hidden chain-of-thought.
  One model is advanced per explicit POST step, with an expected analyst ID,
  request UUID and per-run lock preventing duplicate/replayed steps. Failed
  members remain visible; the master cannot fabricate missing reports.
  No daily, monthly, per-minute or session usage quota and no two-hour result
  reuse policy applies. Context size, output size and timeouts are bounded.
  Page loads, history reads, price refresh, research saves and scheduled MCP
  surveillance do not generate AI. Interrupted runs need an explicit resume.
  Legacy `/api/briefing` reads remain free; explicit POST also has no daily cap.
- A signed-in owner cloud monitor can call the MCP tools while the browser is closed,
  then read back the generation timestamps and persisted signal history.
- Skip unavailable/stale assets. Signal IDs are deduplicated by asset, day, and side.
- Browser notifications require an open page and visitor notification permission.
- Secrets are hosted environment variables, never browser settings or source files:
  `BAZE_API_KEY`, `BAZE_MODEL`, `SITE_OWNER_EMAIL`, `DASHBOARD_ACCESS_KEY`.
  See `.env.example` for key names only.
- Quotes may be delayed. The daily SMA-cross rules have not been validated as a
  profitable trading strategy. AI explains supplied evidence; it cannot place orders.
- ICE high-yield data is not redistributed without permission; provide the FRED
  source link instead. Review source redistribution licenses before commercial use.

## Memory And Research

- Verified public originals are in `lib/research-evidence.ts`, with original dates,
  periods, units, company/industry/broker classifications and source links.
- Research discovery refreshes every 6 hours. Discovery titles are not verified
  estimates and never enter AI numeric evidence. A single broker is not consensus.
- Signed-in Site owners can register verified evidence through `/api/research`;
  anonymous writes return 403. Source verification and publication rights are
  required. No arbitrary source fetch endpoint is exposed.
- DRAMeXchange spot-price redistribution needs prior written permission. No
  unauthorized spot prices are seeded. A registered price keeps its observation
  date, and observations older than five days are explicitly flagged.
- Optional hosted secret `MEMORY_FEED_URL` must be a licensed HTTPS JSON endpoint;
  `MEMORY_FEED_KEY` is an optional bearer token. Set
  `MEMORY_REDISTRIBUTION_APPROVED=true` only after verifying public display rights.
  The feed is requested once per KST calendar day during shared refreshes, not
  scraped from paid pages. Prior permission must cover collection AND link sharing.
  D1 `memory-history:v1` keeps up to 1,080 idempotent product/date/source observations.
  Failed daily requests preserve original observation dates and retry next day.
  A licensed feed and a separately enabled cloud schedule are required for updates
  on days with no visitors. No ineffective or unauthorized crawler is scheduled.
  Response contract: `{ "quotes": [{ "product": "...", "value": <positive number>,
  "unit": "USD/chip", "observedAt": "YYYY-MM-DD", "sourceUrl": "https://..." }] }`.
- General Yahoo feeds may be delayed or interrupted and are not a commercial
  redistribution license. Public real-time equities/indices require an authorized
  vendor feed.

## Access, Toss And Conversation

- `DASHBOARD_LINK_ONLY=true` makes the ordinary base URL directly accessible:
  `/api/access` automatically issues an anonymous signed HttpOnly, SameSite=Strict
  session cookie. No visitor login, account or key entry is required. Existing
  capability URLs still work, but are no longer needed. A forwarded/copied base
  URL lets its recipient view AND spend AI credits; it is not authentication or
  a private allowlist. Robots noindex is supplementary, not access protection.
  Setting this mode false restores the `/#access=<random secret>` gate.
  API keys and the cookie-signing key remain server-only. Native owner identity
  is still required for research editing and MCP, not market viewing or analysis.
- All data routes and paid chat check access on the server. Native Sites owner
  sign-in is retained for editing and MCP. Anonymous MCP data reads are denied.
  Robots are noindex/nofollow; these are supplementary, not authorization.
  Link access does not prevent recipients copying visible reports or forwarding.
- Official Toss API: `https://openapi.tossinvest.com`. Configure server secrets
  `TOSS_CLIENT_ID`, `TOSS_CLIENT_SECRET`, `TOSS_TOKEN_ENCRYPTION_KEY` (32+ chars),
  and `TOSS_SHARING_APPROVED=true` only after confirming quote-sharing rights.
  Use a dedicated OAuth client: new tokens invalidate prior tokens for that client.
  Tokens are AES-GCM encrypted in D1 and issuance is protected by a distributed lock.
  Only `/prices`, `/candles`, and KOSPI market-indicator read endpoints are allowed.
  No account, holdings, order endpoints or account headers are used.
- Toss requires allowed source IPs. Local IP authorization does not authorize
  hosted Worker egress. Confirm hosted egress support with Toss or supply an
  authorized fixed-egress backend before claiming a working production feed.
  IP/auth/rate-limit errors are sanitized; Yahoo fallback remains explicitly labeled.
  Domestic quotes are 10-second polling, not a tick-by-tick WebSocket stream.
- Broker horizontal plots compare matching quarter/unit/latest publisher reports;
  two registered brokers are not whole-market consensus. Annual EPS/BPS values
  and original PDF pages are separately verified in `lib/valuation.ts`.
  PER = annual EPS x assumed multiple; PBR = annual BPS x assumed multiple.
  Multiples are illustrative scenarios, not recommendations or price guarantees.
- `/api/chat` requires a valid anonymous/owner session and same-origin POST. Only bounded
  alternating user/assistant history is accepted. Conversation stays in browser
  memory, is sent to Baze with `store:false`, and is not saved/shared by the Site.
  External provider retention policies still apply. No secret or account data
  should be entered. There is no call quota. Each sent question is a new call;
  an in-flight lock prevents overlapping duplicate requests. Up to 5 prior turns,
  3,000 chars per question and 6,000 output tokens bound request size, not usage.
  `analysisRunId` links a conversation to the selected saved expert/master reports.
  Analysis records are shared with authorized link holders; chats are not saved.
  Usage counts provider attempts; errors/disconnect/cancel may still incur costs.

## Verification

`node --import tsx --test tests/technical.test.ts` checks signal and date rules.
`node --import tsx tests/browser-smoke.ts` checks the real page. Set
`RADAR_TEST_FIXTURE=1` only for local UI testing on blocked networks; fixture
data is intercepted inside the test browser and never stored in the app.

## Framework

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
