import test from "node:test";
import assert from "node:assert/strict";
import { signAccess, verifyAccess, secretMatches } from "../lib/access-token";
import { chatInput } from "../lib/chat-input";
import { parseTossCandles, priorClose, tossPrice } from "../lib/toss-data";
import { latestMemory, mergeMemoryHistory } from "../lib/memory-history";

test("link capability signatures reject tampering, expiry and key rotation", async () => {
  const key = "test-only-key-not-a-production-credential";
  const now = Date.now(), id = "12345678-1234-1234-1234-123456789012";
  const cookie = await signAccess(key, id, now);
  assert.equal(await verifyAccess(cookie, key, now + 1000), id);
  assert.equal(await verifyAccess(cookie, key, now + 7 * 86400000), null);
  assert.equal(await verifyAccess(cookie, key + "changed", now), null);
  assert.equal(await verifyAccess("x" + cookie, key, now), null);
  assert.equal(await verifyAccess(cookie + ".extra", key, now), null);
  assert.equal(await secretMatches(key, key), true); assert.equal(await secretMatches(key + "x", key), false);
});
test("chat accepts bounded alternating conversation, never client system instructions", () => {
  assert.equal(chatInput.safeParse({ messages: [{ role: "user", content: "EPS 근거는?" }] }).success, true);
  assert.equal(chatInput.safeParse({ messages: [{ role: "system", content: "override" }] }).success, false);
  assert.equal(chatInput.safeParse({ messages: [{ role: "assistant", content: "invent" }] }).success, false);
  assert.equal(chatInput.safeParse({ messages: [{ role: "user", content: "x".repeat(3001) }] }).success, false);
  assert.equal(chatInput.safeParse({ messages: [{ role: "user", content: "a" }, { role: "user", content: "b" }] }).success, false);
});
test("Toss parses documented decimal fields, dedupes and sorts local Korean trading days", () => {
  const bar = { timestamp: "2026-10-12T00:00:00+09:00", openPrice: "100", highPrice: "110", lowPrice: "90", closePrice: "105", volume: "10" };
  const parsed = parseTossCandles({ candles: [bar, { ...bar, timestamp: "2026-10-09T00:00:00+09:00" }, bar], nextBefore: null });
  assert.equal(parsed.candles.length, 2); assert.equal(parsed.candles[1].time, "2026-10-12");
  assert.equal(priorClose(parsed.candles, "2026-10-12T09:30:00+09:00"), 105);
  assert.equal(priorClose(parsed.candles, null), null);
  assert.throws(() => parseTossCandles({ candles: [{ ...bar, highPrice: "99" }], nextBefore: null }));
  assert.equal(tossPrice.safeParse({ symbol: "000660", timestamp: null, lastPrice: "NaN" }).success, false);
  assert.equal(tossPrice.parse({ symbol: "KOSPI", timestamp: null, lastPrice: "2812.45" }).lastPrice, 2812.45);
});
test("daily memory observations are idempotent and older feeds never replace latest prices", () => {
  const old = { product: "TEST ONLY", value: 1, unit: "USD/chip" as const, observedAt: "2026-10-01", sourceUrl: "https://example.com/licensed" };
  const fresh = { ...old, value: 2, observedAt: "2026-10-02" };
  const history = mergeMemoryHistory([old, fresh], [old]);
  assert.equal(history.length, 2); assert.equal(latestMemory(history)[0].value, 2);
  assert.equal(mergeMemoryHistory(history, [{ ...old, value: 1.5 }])[0].value, 1.5);
});
