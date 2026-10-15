import type { Asset, Macro } from "./radar-types";
export function applyDomesticRisk(asset: Asset, kospi: Asset | undefined, hy: Macro | undefined): Asset["signal"] {
  if (!["hynix", "samsung"].includes(asset.id) || asset.signal.side !== "BUY") return asset.signal;
  if (!kospi || kospi.stale || (kospi.technical.score ?? 0) < 40 || (hy?.value != null && !hy.stale && hy.value >= 5)) {
    return { ...asset.signal, side: "WAIT", reason: "상향 교차 발생 · 코스피/신용 위험 필터 미충족" };
  }
  return asset.signal;
}
