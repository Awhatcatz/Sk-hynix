import type { Candle } from "./radar-types";

export function cryptoDailyBarsComplete(candles: Candle[], now = new Date()): boolean {
  const recent = candles.slice(-36);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  return recent.length === 36 && recent.at(-1)?.time === yesterday && recent.every((bar, index) =>
    index === 0 || Date.parse(bar.time) - Date.parse(recent[index - 1].time) === 86400000);
}

export function quoteIsStale(assetId: string, timestamp: number, now = new Date()): boolean {
  const age = now.getTime() / 1000 - timestamp;
  if (!Number.isFinite(timestamp) || timestamp <= 0 || age < -300) return true;
  if (assetId === "bitcoin") return age > 1800;
  const korean = ["hynix", "samsung", "kospi"].includes(assetId);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: korean ? "Asia/Seoul" : "America/New_York",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (key: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === key)?.value;
  const weekday = !["Sat", "Sun"].includes(part("weekday") || "");
  const minutes = Number(part("hour")) * 60 + Number(part("minute"));
  const marketOpen = weekday && (korean ? minutes >= 540 && minutes <= 940
    : assetId === "gold" ? minutes < 1020 || minutes >= 1080 : minutes >= 570 && minutes <= 975);
  return age > (marketOpen ? assetId === "gold" ? 7200 : 1800 : 5 * 86400);
}
