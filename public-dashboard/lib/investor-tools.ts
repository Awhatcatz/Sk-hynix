import { validBuyCandidate, type TradeCandidate } from "./trade-plan";
import type { CouncilAssetId } from "./council-contract";

export function entryDistance(candidate: TradeCandidate, price: number | null | undefined): number | null {
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? (candidate.trigger.price / price - 1) * 100 : null;
}

// Intraday contact is only an alert; CLOSE conditions still need a confirmed bar.
export function priceConditionTouched(candidate: TradeCandidate, price: number | null | undefined): boolean {
  if (!validBuyCandidate(candidate) || typeof price !== "number" || !Number.isFinite(price) || price <= candidate.invalidation.price || price >= candidate.target!.price) return false;
  return candidate.trigger.comparator === "AT_OR_BELOW" ? price <= candidate.trigger.price : price >= candidate.trigger.price;
}

export function positionSimulation(assetId: CouncilAssetId, candidate: TradeCandidate, budget: number, riskBudget: number) {
  if (!["hynix", "bitcoin"].includes(assetId) || !validBuyCandidate(candidate) || !Number.isFinite(budget) || !Number.isFinite(riskBudget) || budget <= 0 || riskBudget <= 0 || budget > Number.MAX_SAFE_INTEGER || riskBudget > Number.MAX_SAFE_INTEGER) return null;
  const entry = candidate.trigger.price, risk = entry - candidate.invalidation.price;
  const scale = assetId === "bitcoin" ? 1e8 : 1;
  const quantity = Math.floor(Math.min(budget / entry, riskBudget / risk) * scale) / scale;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return { quantity, investment: quantity * entry, loss: quantity * risk, profit: quantity * (candidate.target!.price - entry) };
}
