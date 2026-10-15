import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { ASSETS } from "../lib/radar-types";
import { ANALYSTS, COUNCIL_ASSETS, type CouncilRun } from "../lib/council-contract";
import { technical, signalFor } from "../lib/technical";
import { RESEARCH_EVIDENCE } from "../lib/research-evidence";
import type { WebSocketRoute } from "playwright";

const url = process.env.RADAR_TEST_URL || "http://127.0.0.1:5173";
const fixture = process.env.RADAR_TEST_FIXTURE === "1";
const accessToken = process.env.RADAR_ACCESS_TOKEN;
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
await mkdir("outputs", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors: string[] = [];
let liveTicks = 0;
let analysisRequests = 0, chatRequests = 0, marketRequests = 0;
let modelSteps = 0;
let hynixPrice: number | null = null;
let lastChatRunId: string | undefined;
page.on("request", (request) => {
  const path = new URL(request.url()).pathname;
  if (["/api/briefing", "/api/council"].includes(path) && request.method() === "POST") analysisRequests++;
  if (path === "/api/council" && request.method() === "POST" && request.postDataJSON().action === "step") modelSteps++;
  if (path === "/api/chat" && request.method() === "POST") { chatRequests++; lastChatRunId = request.postDataJSON().analysisRunId; }
  if (path === "/api/markets") marketRequests++;
});
page.on("websocket", (socket) => { if (socket.url().includes("coinbase")) socket.on("framereceived", (frame) => { try { if (JSON.parse(String(frame.payload)).type === "ticker") liveTicks++; } catch { /* Other websocket frames are irrelevant to quote verification. */ } }); });
let mockSocket: WebSocketRoute | undefined;
page.on("pageerror", (error) => errors.push(error.message));
if (fixture) {
  await page.clock.install();
  // Test-only data exercises canvas controls when the local network blocks finance sources.
  const assets = ASSETS.map((asset, index) => {
    const candles = Array.from({ length: 260 }, (_, i) => {
      const close = (100 + i * .1 + 3 * Math.sin(i / 4)) * (index + 1) * (asset.id === "hynix" ? 1000 : 10);
      return { time: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10), open: close * .997, high: close * 1.015, low: close * .985, close, volume: 10000 + i * 50 };
    });
    return { ...asset, price: candles.at(-1)!.close, change: 100, changePct: 1.2, quoteTime: new Date().toISOString(), stale: false,
      source: "Test fixture", sourceUrl: "https://finance.yahoo.com", candles, technical: technical(candles), signal: signalFor(candles, false), error: null };
  });
  const snapshotAsOf = new Date().toISOString();
  await page.route("**/api/markets", (route) => route.fulfill({ json: { generatedAt: snapshotAsOf, assets, macro: [], news: [], events: [], warnings: [], methodologyVersion: "TEST", research: { checkedAt: snapshotAsOf, evidence: RESEARCH_EVIDENCE, memory: [], memoryStatus: "승인 피드 대기", discoveries: [], warnings: [] } } }));
  await page.route("**/api/quotes", (route) => route.fulfill({ json: { generatedAt: new Date().toISOString(), quotes: assets.map((asset) => ({ ...asset, ...(asset.id === "hynix" && hynixPrice !== null ? { price: hynixPrice } : {}), mode: "POLL", changeBasis: "PREVIOUS_CLOSE", delayMinutes: null })) } }));
  await page.route("**/api/research", (route) => route.fulfill({ json: { canEdit: false } }));
  await page.route("**/api/chat", (route) => route.fulfill({ json: { reply: "테스트 전용 답변. 연간 EPS와 가정 PER의 곱이며 미래 가격 보장이 아닙니다.", model: "TEST", asOf: new Date().toISOString(), sources: [] } }));
  await page.routeWebSocket("wss://ws-feed.exchange.coinbase.com", (socket) => { mockSocket = socket; socket.onMessage(() => socket.send(JSON.stringify({ type: "ticker", product_id: "BTC-USD", price: "100000", open_24h: "90000", time: new Date().toISOString() }))); });
  const runs = new Map<string, CouncilRun>();
  let used = 1001;
  await page.route("**/api/council**", async (route) => {
    const request = route.request(), params = new URL(request.url()).searchParams;
    const usage = () => ({ day: "2026-10-13", analysisCalls: used, chatCalls: 0, totalCalls: used, unlimited: true });
    if (request.method() === "GET") {
      await route.fulfill({ json: params.get("id") ? { run: runs.get(params.get("id")!), usage: usage() } : { history: [...runs.values()].filter((run) => run.assetId === params.get("asset")).reverse(), usage: usage() } }); return;
    }
    const body = request.postDataJSON();
    if (body.action === "step") {
      const actor = runs.get(body.runId)!.analysts.find((item) => item.id === body.analystId)!;
      actor.status = "running"; actor.startedAt = new Date().toISOString();
    }
    await new Promise((resolve) => setTimeout(resolve, body.action === "step" ? body.analystId === "bollinger" ? 6000 : 1800 : 200));
    if (body.action === "start") runs.set(body.requestId, { id: body.requestId, assetId: body.assetId, assetName: ASSETS.find((item) => item.id === body.assetId)!.name,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "pending", marketAsOf: new Date().toISOString(), quoteAsOf: new Date().toISOString(), dailyBarTime: "2026-10-12", stale: false, warnings: [], sources: [{ id: "daily", title: "검증용 일봉", date: "2026-10-12", url: "https://finance.yahoo.com" }],
      analysts: ANALYSTS.map((item) => ({ id: item.id, model: item.model, status: "pending", report: null, error: null, attempts: 0, tokens: null, startedAt: null, completedAt: null })) });
    const run = runs.get(body.runId || body.requestId)!;
    if (body.action === "step") {
      const actor = run.analysts.find((item) => item.id === body.analystId)!;
      actor.status = "done"; actor.attempts = 1; actor.completedAt = new Date().toISOString(); actor.tokens = { input: 300, output: 200, total: 500 };
      actor.report = { stance: "NEUTRAL", headline: actor.id + "의 검증용 분석", summary: "확정 일봉을 비교한 테스트 자료입니다. 미래 수익은 보장되지 않습니다.", findings: [{ observation: "20일선과 확정 일봉을 비교했습니다.", sourceId: "daily" }], upsideCondition: "확정 종가가 20일선을 회복", downsideCondition: "확정 종가가 지지선을 이탈", lesson: "이평선은 최근 가격의 평균입니다.", caution: "검증 전용 가상 자료입니다.", agreements: ["방향 확인 필요"], disagreements: ["단기와 장기 흐름의 차이"], watchpoints: ["다음 확정 종가"] };
      if (actor.id === "master") run.tradePlan = { action: "BUY", candidate: { id: "buy-support", action: "BUY", name: "테스트용 지지 반등", trigger: { price: 120000, comparator: "AT_OR_BELOW", basis: "테스트 지지선" }, target: { price: 140000, comparator: "AT_OR_ABOVE", basis: "테스트 저항선" }, invalidation: { price: 110000, comparator: "CLOSE_BELOW", basis: "테스트 무효화" }, confirmation: "새 확정 일봉으로 반등 확인 후 검토", riskReward: 2 }, unit: "원", asOf: new Date().toISOString(), validUntil: new Date(Date.now() + 86400000).toISOString(), dailyBarTime: "2026-10-12", referencePrice: 125000, referenceTime: new Date().toISOString(), reason: "검증 전용 가상 자료입니다. 실제 매수 권고가 아닙니다." };
      if (actor.id === "master" && runs.size > 1) run.tradePlan = { ...run.tradePlan!, action: "HOLD", buyWatch: { candidate: run.tradePlan!.candidate!, selectedBy: "MASTER" }, candidate: null };
      run.status = actor.id === "master" ? "complete" : "running"; used++;
      if (body.analystId === "bollinger") {
        const lagged = structuredClone(run); lagged.analysts[0].status = "running"; lagged.analysts[0].report = null; lagged.analysts[0].startedAt = new Date().toISOString();
        await route.fulfill({ json: { run: lagged, usage: usage() } }); return;
      }
      if (body.analystId === "fable") { await route.abort("failed"); return; }
    }
    await route.fulfill({ json: { run, usage: usage() } });
  });
}
try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  if (process.env.RADAR_LINK_ONLY !== "1") {
    assert.equal(await page.locator(".asset-tile").count(), 0);
    assert.ok(accessToken);
    await page.goto(url + "#access=" + encodeURIComponent(accessToken!), { waitUntil: "networkidle", timeout: 90000 });
  }
  await page.waitForSelector(".asset-tile");
  assert.equal(new URL(page.url()).hash, "", "Capability must be removed from visible URL");
  assert.equal(await page.getByRole("link", { name: "소유자 로그인" }).count(), 0, "No login flow");
  await page.waitForTimeout(4000);
  assert.equal(await page.locator(".asset-tile").count(), COUNCIL_ASSETS.length);
  assert.equal(await page.locator(".research-section, .macro-section, .scanner-table, #criteriaTitle, #signals, #news").count(), 0, "Complex dashboard panels must not be mounted");
  assert.equal(await page.getByRole("group", { name: "분석 대상", exact: true }).count(), 1, "One shared asset control");
  assert.ok((await page.locator("#councilTitle").textContent())?.includes("SK하이닉스"));
  if (fixture) assert.equal(await page.getByRole("textbox", { name: "AI에게 질문" }).isDisabled(), true, "Chat waits for a completed master briefing");
  assert.equal(analysisRequests, 0, "Page load must not initiate AI analysis");
  assert.equal(chatRequests, 0, "Page load must not initiate chat");
  await page.getByRole("button", { name: "시세 갱신", exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(analysisRequests, 0, "Quote/market refresh must not initiate analysis");
  if (fixture) {
    const startMarkets = marketRequests;
    await page.clock.fastForward(11 * 60000);
    await page.waitForTimeout(500);
    assert.ok(marketRequests > startMarkets, "Market auto refresh must remain active");
    assert.equal(analysisRequests, 0, "Old ten-minute AI timer must be removed");
    assert.equal(chatRequests, 0);
    const office = page.locator(".office-scene");
    await office.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector(".office-scene")?.getAttribute("data-ready") === "true");
    assert.ok(await office.evaluate((canvas: HTMLCanvasElement) => { const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data; const colors = new Set<string>(); for (let i = 0; i < pixels.length; i += 80) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`); return colors.size > 100; }), "Office must render the actual background and characters");
    const analyze = page.getByRole("button", { name: "AI 분석", exact: true });
    await analyze.click();
    await page.getByRole("button", { name: "분석 중", exact: true }).waitFor();
    await page.locator(".analyst-roster .is-working").waitFor();
    assert.notEqual(await page.locator(".analyst-roster .is-working .analyst-avatar").evaluate((node) => getComputedStyle(node).animationName), "none");
    const workingSprite = page.locator(".analyst-roster .is-working");
    const idlePixels = createHash("sha256").update(await workingSprite.screenshot({ animations: "allow" })).digest("hex");
    await page.waitForTimeout(400);
    assert.notEqual(createHash("sha256").update(await workingSprite.screenshot({ animations: "allow" })).digest("hex"), idlePixels, "Working character pixels must actually move");
    await page.locator(".analyst-state.running").waitFor();
    assert.ok((await page.locator(".analyst-state.running").textContent())?.includes("초"), "In-flight server state must show elapsed time");
    await office.scrollIntoViewIfNeeded();
    const officeFrame = createHash("sha256").update(await office.screenshot({ animations: "allow" })).digest("hex");
    await page.waitForTimeout(350);
    assert.notEqual(createHash("sha256").update(await office.screenshot({ animations: "allow" })).digest("hex"), officeFrame, "Office characters must work, not just show a static backdrop");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator(".analyst-roster .is-working .analyst-avatar").evaluate((node) => getComputedStyle(node).animationName), "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.equal(await page.getByRole("button", { name: "분석 중", exact: true }).isDisabled(), true);
    assert.equal(await page.locator(".asset-tile").first().isDisabled(), true, "Asset switching cannot interrupt a paid pipeline");
    await page.locator(".analysis-notice").filter({ hasText: "네 전문가와 마스터" }).waitFor();
    assert.equal(modelSteps, 5, "Busy/lost responses recover with reads, never duplicate paid steps");
    assert.ok((await page.locator(".master-decision").textContent())?.includes("조건부 매수"));
    assert.ok((await page.locator(".master-decision h3").textContent())?.includes("120,000원 이하"));
    assert.ok((await page.locator(".decision-levels").textContent())?.includes("110,000원"));
    await page.waitForFunction(() => document.querySelector(".market-chart")?.getAttribute("data-price-levels") === "3");
    const levelsOn = createHash("sha256").update(await page.locator(".market-chart").first().screenshot()).digest("hex");
    await page.getByRole("checkbox", { name: "캡틴 가격선", exact: true }).uncheck();
    await page.waitForFunction(() => document.querySelector(".market-chart")?.getAttribute("data-price-levels") === "0");
    assert.notEqual(createHash("sha256").update(await page.locator(".market-chart").first().screenshot()).digest("hex"), levelsOn, "Validated captain levels must change chart pixels");
    await page.getByRole("checkbox", { name: "캡틴 가격선", exact: true }).check();
    await page.locator(".position-simulation summary").click();
    await page.getByRole("spinbutton", { name: "가상 투자금", exact: true }).fill("1000000");
    await page.getByRole("spinbutton", { name: "가정 손실 예산", exact: true }).fill("25000");
    assert.ok((await page.locator(".simulation-result").textContent())?.includes("2주"));
    assert.ok((await page.locator(".simulation-result").textContent())?.includes("240,000 원"));
    assert.ok((await page.locator(".simulation-result").textContent())?.includes("40,000 원"));
    const alertButton = page.getByRole("button", { name: "가격 도달 알림", exact: true });
    await alertButton.click();
    assert.equal(await alertButton.getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".entry-alert").count(), 0, "Arming above entry must not claim price contact");
    hynixPrice = 120000;
    await page.getByRole("button", { name: "시세 갱신", exact: true }).click();
    await page.locator(".entry-alert").waitFor();
    assert.ok((await page.locator(".entry-alert").textContent())?.includes("매수 확정은 아닙니다"));
    await page.getByRole("button", { name: "시세 갱신", exact: true }).click();
    assert.equal(await page.locator(".entry-alert").count(), 1, "Contact alert must not duplicate on quote polling");
    assert.equal(modelSteps, 5); assert.equal(chatRequests, 0, "Investor tools must never call AI");
    await alertButton.click();
    hynixPrice = 125000;
    await page.getByRole("button", { name: "시세 갱신", exact: true }).click();
    await page.getByRole("button", { name: "업무 장면 다시 보기", exact: true }).click();
    await office.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => Number(document.querySelector(".office-scene")?.getAttribute("data-deliveries")) > 0);
    const deliveryFrame = createHash("sha256").update(await office.screenshot({ animations: "allow" })).digest("hex");
    await page.waitForTimeout(650);
    assert.notEqual(createHash("sha256").update(await office.screenshot({ animations: "allow" })).digest("hex"), deliveryFrame, "Report deliveries must move through the office");
    assert.equal(modelSteps, 5, "Office replay must never call a model");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.getByRole("button", { name: "업무 장면 다시 보기", exact: true }).isDisabled(), true);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await office.screenshot({ path: "outputs/office-desktop.png", animations: "allow" });
    assert.ok((await page.locator(".master-chat-briefing").textContent())?.includes("master의 검증용 분석"));
    assert.equal(await page.getByRole("textbox", { name: "AI에게 질문" }).isDisabled(), false);
    assert.ok((await page.locator(".analysis-usage").textContent())?.includes("제한 없음"));
    await page.getByRole("button", { name: "매수 조건은?", exact: true }).click();
    assert.ok((await page.getByRole("textbox", { name: "AI에게 질문" }).inputValue()).includes("가격과 추가 확인 조건"));
    assert.equal(chatRequests, 0, "Suggested questions only fill the draft, not a paid request");
    await page.getByRole("textbox", { name: "AI에게 질문" }).fill("");
    const firstId = await page.getByLabel("분석 기록", { exact: true }).inputValue();
    await analyze.click();
    await page.locator(".analysis-notice").filter({ hasText: "네 전문가와 마스터" }).waitFor();
    await analyze.waitFor({ state: "visible" });
    assert.equal(modelSteps, 10, "Every explicit run is fresh, even immediately after completion");
    const secondId = await page.getByLabel("분석 기록", { exact: true }).inputValue(); assert.notEqual(firstId, secondId);
    assert.ok((await page.locator(".entry-caption").textContent())?.includes("현재 판단은 보류"));
    assert.ok((await page.locator(".master-decision h3").textContent())?.includes("120,000원"), "HOLD still shows a separately selected watch price");
    assert.equal(await page.locator(".market-chart").first().getAttribute("data-price-mode"), "WATCH");
    assert.equal(await page.getByRole("button", { name: "가격 도달 알림", exact: true }).getAttribute("aria-pressed"), "false", "New run resets local alerts");
    await page.getByLabel("분석 기록", { exact: true }).selectOption(firstId);
    for (const actor of ANALYSTS) {
      await page.getByRole("tab", { name: new RegExp(actor.name) }).click();
      assert.ok((await page.locator("#analyst-report").textContent())?.includes(actor.id + "의 검증용 분석"));
      assert.equal(await page.locator(".report-detail").getAttribute("open"), null);
      await page.locator(".report-detail summary").click();
      assert.equal(await page.locator(".report-findings").isVisible(), true, "Detailed evidence remains available on demand");
      assert.equal(await page.locator(".report-detail .report-caution").isVisible(), true, "Full analyst-specific risks remain in the detailed report");
    }
    assert.equal(modelSteps, 10, "Record and character selection must be free reads");
    for (const asset of ["nasdaq", "bitcoin", "kospi", "hynix"]) {
      await page.locator(".asset-tile").filter({ hasText: ASSETS.find((item) => item.id === asset)!.name }).click();
      await page.waitForTimeout(250);
      assert.equal(modelSteps, 10, "Asset selection must not start AI");
      assert.equal(await page.locator(".selected-title h2").textContent(), ASSETS.find((item) => item.id === asset)!.name);
      assert.ok((await page.locator("#councilTitle").textContent())?.includes(ASSETS.find((item) => item.id === asset)!.name));
    }
    await page.getByRole("tab", { name: /캡틴/ }).click();
    await page.getByRole("tab", { name: /캡틴/ }).press("Home");
    assert.equal(await page.getByRole("tab", { name: /밴드/ }).getAttribute("aria-selected"), "true", "Keyboard navigation selects bot reports");
    await page.getByRole("tab", { name: /캡틴/ }).click();
    await page.clock.setSystemTime(new Date());
    await page.clock.runFor(16000);
    await page.clock.resume();
  }
  assert.equal(await page.locator(".analyst-roster .analyst-avatar").count(), 5);
  assert.equal(await page.evaluate(async () => { const image = new Image(); image.src = "/characters/analyst-team.png"; await image.decode(); const canvas = document.createElement("canvas"); canvas.width = 1500; canvas.height = 300; const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0); return Array.from({ length: 5 }, (_, cell) => { const data = context.getImageData(cell * 300, 0, 300, 300).data; let colored = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) colored++; return colored > 1000; }).every(Boolean); }), true, "All five sprite cells must render actual nonblank characters");
  if (!fixture && process.env.RADAR_TEST_COUNCIL_REAL === "1") {
    await page.locator(".asset-tile").filter({ hasText: "SK하이닉스" }).click();
    await page.getByRole("button", { name: "AI 분석", exact: true }).click();
    await page.locator(".analysis-notice").filter({ hasText: "네 전문가와 마스터" }).waitFor({ timeout: 600000 });
    assert.equal(await page.locator(".analyst-state.done").count(), 5, "All five real model reports must complete");
    assert.ok((await page.locator("#analyst-report").textContent())!.length > 100);
  }
  const btcTile = page.locator(".asset-tile").filter({ hasText: "비트코인" });
  if (!fixture) {
    await page.waitForSelector(".live-dot", { timeout: 20000 });
    assert.ok(liveTicks > 0, "Real Coinbase ticker frames expected");
  }
  if (fixture) {
    const btc = page.locator(".asset-tile").filter({ hasText: "비트코인" });
    assert.ok((await btc.textContent())?.includes("24시간 대비"));
    assert.equal(await btc.locator(".live-dot").count(), 1);
    mockSocket!.send(JSON.stringify({ type: "ticker", product_id: "BTC-USD", price: "100050", open_24h: "90000", time: new Date().toISOString() }));
    await page.waitForFunction(() => [...document.querySelectorAll(".asset-tile")].some((tile) => tile.textContent?.includes("$100,050")));
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "outputs/desktop.png", fullPage: true });
  await page.locator("#ai-team").screenshot({ path: "outputs/council-desktop.png" });
  await page.waitForSelector(".market-chart canvas", { timeout: 60000 });
  {
    const unique = await page.locator(".market-chart canvas").first().evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set<string>();
      for (let i = 0; i < data.length; i += 16) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return colors.size;
    });
    assert.ok(unique > 20, `Blank chart: ${unique} colors`);
    const main = page.locator(".market-chart").first();
    await page.mouse.move(1, 1);
    const withBand = createHash("sha256").update(await main.screenshot()).digest("hex");
    await page.getByRole("checkbox", { name: "볼린저 밴드", exact: true }).first().uncheck();
    await page.waitForTimeout(300);
    const withoutBand = createHash("sha256").update(await main.screenshot()).digest("hex");
    assert.notEqual(withBand, withoutBand, "Bollinger toggle must alter rendered chart pixels");
    await page.getByRole("checkbox", { name: "볼린저 밴드", exact: true }).first().check();
    const withAverage = createHash("sha256").update(await main.screenshot()).digest("hex");
    await page.getByRole("checkbox", { name: "이평선", exact: true }).first().uncheck();
    assert.notEqual(createHash("sha256").update(await main.screenshot()).digest("hex"), withAverage, "Moving average toggle must alter chart pixels");
    await page.getByRole("checkbox", { name: "이평선", exact: true }).first().check();
    await page.getByRole("button", { name: "1M", exact: true }).first().click();
    assert.ok((await page.locator(".chart-subline").textContent())?.includes("1M 변동"));
    await page.getByRole("button", { name: "차트 확대", exact: true }).click();
    const expanded = page.locator(".market-chart.expanded");
    const before = createHash("sha256").update(await expanded.screenshot()).digest("hex");
    const box = await expanded.boundingBox();
    await page.mouse.move(box!.x + box!.width * .65, box!.y + box!.height * .4);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(400);
    const after = createHash("sha256").update(await expanded.screenshot()).digest("hex");
    assert.notEqual(before, after, "Wheel zoom must change rendered chart pixels");
    await page.screenshot({ path: "outputs/expanded-chart.png" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "차트 위치 초기화", exact: true }).click();
    await page.locator(".asset-tile").filter({ hasText: "코스피" }).click();
    assert.equal(await page.locator(".selected-title h2").textContent(), "코스피");
    await page.locator(".asset-tile").filter({ hasText: "SK하이닉스" }).click();
    await page.waitForTimeout(500);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  const canvasBeforePolling = await page.locator(".market-chart canvas").first().elementHandle();
  if (fixture) {
    await page.clock.install();
    await page.clock.fastForward(31000);
    assert.equal(await canvasBeforePolling!.evaluate((canvas) => canvas.isConnected), true, "Quote polling must preserve the candle canvas and zoom");
  }
  if (fixture || process.env.RADAR_TEST_CHAT_REAL === "1") {
    await page.getByRole("button", { name: "틀릴 위험은?", exact: true }).click();
    assert.ok((await page.getByRole("textbox", { name: "AI에게 질문" }).inputValue()).includes("가장 중요한 위험"));
    await page.getByRole("button", { name: "질문 전송", exact: true }).click();
    await page.waitForSelector(".chat-message.assistant", { timeout: 110000 });
    assert.ok((await page.locator(".chat-message.assistant").textContent())!.length > 30);
    assert.ok((await page.locator(".chat-message.assistant strong").textContent())?.includes("캡틴"));
    if (fixture || process.env.RADAR_TEST_COUNCIL_REAL === "1") {
      const selectedRecord = await page.getByLabel("분석 기록", { exact: true }).inputValue();
      assert.ok(selectedRecord, "A saved report must be selected for follow-up chat");
      assert.equal(lastChatRunId, selectedRecord, "Chat must continue the selected expert/master briefing");
    }
    await page.getByRole("button", { name: "대화 지우기", exact: true }).click();
    assert.equal(await page.locator(".chat-message").count(), 0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const mobileNav = page.getByRole("navigation", { name: "모바일 탐색", exact: true });
  assert.equal(await mobileNav.isVisible(), true);
  await mobileNav.getByRole("link", { name: "캡틴과 대화", exact: true }).click();
  await page.waitForTimeout(600);
  assert.ok((await page.locator("#ai-chat").boundingBox())!.y < 844, "Mobile navigation jumps directly to master chat");
  await mobileNav.getByRole("link", { name: "분석실", exact: true }).click();
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Mobile horizontal overflow");
  await page.screenshot({ path: "outputs/mobile.png", fullPage: true });
  await page.locator("#ai-team").screenshot({ path: "outputs/council-mobile.png" });
  await page.locator(".office-scene").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector(".office-scene")?.getAttribute("data-ready") === "true");
  assert.ok(await page.locator(".office-scene").evaluate((canvas: HTMLCanvasElement) => { const p = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data; const colors = new Set<string>(); for (let i = 0; i < p.length; i += 60) colors.add(`${p[i]},${p[i+1]},${p[i+2]}`); return colors.size > 100; }), "Mobile office must remain nonblank after resize");
  await page.locator(".office-scene").screenshot({ path: "outputs/office-mobile.png", animations: "allow" });
  await page.setViewportSize({ width: 320, height: 780 });
  await page.waitForTimeout(600);
  if (fixture) {
    await page.locator(".position-simulation summary").click();
    await page.getByRole("spinbutton", { name: "가상 투자금", exact: true }).fill("1000000");
    await page.getByRole("spinbutton", { name: "가정 손실 예산", exact: true }).fill("25000");
    await page.locator(".master-decision").screenshot({ path: "outputs/investor-mobile320.png" });
  }
  if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) console.log(await page.evaluate(() => [...document.querySelectorAll("body *")].filter((node) => { const rect = node.getBoundingClientRect(); return rect.right > innerWidth && !node.closest(".table-scroll"); }).slice(0, 15).map((node) => ({ tag: node.tagName, class: node.className, right: node.getBoundingClientRect().right }))));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Small mobile horizontal overflow");
  if (fixture) {
    await page.clock.fastForward(25 * 3600000);
    await page.waitForFunction(() => document.querySelector(".market-chart")?.getAttribute("data-price-levels") === "0");
    assert.ok((await page.locator(".master-decision").textContent())?.includes("보류"), "Expired plans must become HOLD and remove actionable chart lines");
    assert.equal(await page.locator(".buy-entry-tools").count(), 0, "Expired watch disables alert and simulation controls");
    assert.equal(modelSteps, 10, "Time-based expiry must not trigger paid analysis");
    assert.ok((await btcTile.textContent())?.includes("전일 대비"), "Fallback quote labels must follow the provider's change basis, not hard-code 24 hours");
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ url, fixture, assetTiles: COUNCIL_ASSETS.length, liveTicks, manualAnalysis: "pass", analysisRequests, chatRequests, btcQuote: await btcTile.textContent(), screenshots: ["desktop.png", "expanded-chart.png", "mobile.png"], errors }));
} catch (cause) {
  console.log(JSON.stringify({ failure: String(cause), analysisRequests, modelSteps, chatRequests, notice: await page.locator(".analysis-notice").allTextContents(), states: await page.locator(".analyst-state").allTextContents(), errors }));
  await page.screenshot({ path: "outputs/browser-failure.png", fullPage: true }).catch(() => {});
  throw cause;
} finally { await browser.close(); }
