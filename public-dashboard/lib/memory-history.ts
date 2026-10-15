import type { MemoryQuote } from "./radar-types";
export function mergeMemoryHistory(previous: MemoryQuote[], incoming: MemoryQuote[]) {
  const records = new Map(previous.map((item) => [JSON.stringify([item.product, item.observedAt, item.sourceUrl]), item]));
  incoming.forEach((item) => records.set(JSON.stringify([item.product, item.observedAt, item.sourceUrl]), item));
  return [...records.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt)).slice(-1080);
}
export function latestMemory(history: MemoryQuote[]) {
  const products = new Map<string, MemoryQuote>();
  [...history].sort((a, b) => a.observedAt.localeCompare(b.observedAt)).forEach((item) => products.set(item.product, item));
  return [...products.values()].slice(-12);
}
