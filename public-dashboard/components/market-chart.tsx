"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries, LineSeries, LineType } from "lightweight-charts";
import type { AutoscaleInfo, LogicalRange } from "lightweight-charts";
import type { Asset, SignalEvent } from "../lib/radar-types";
import { SMA, BollingerBands } from "technicalindicators";
import { periodCandles } from "../lib/chart-period";
import { buyScenario, type TradePlan } from "../lib/trade-plan";

export default function MarketChart({ asset, period, events, expanded = false, bollinger = true, averages = true, tradePlan, resetKey = 0 }: { asset: Asset | undefined; period: string; events: SignalEvent[]; expanded?: boolean; bollinger?: boolean; averages?: boolean; tradePlan?: TradePlan; resetKey?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<{ id: string; period: string; resetKey: number; range: LogicalRange | null } | null>(null);
  const candidate = buyScenario(tradePlan) || (tradePlan?.action !== "HOLD" ? tradePlan?.candidate : null);
  const watching = tradePlan?.action === "HOLD" && !!candidate;
  const levelMode = watching ? "WATCH" : tradePlan?.action || "NONE";
  const entry = candidate?.trigger.price, target = candidate?.target?.price, stop = candidate?.invalidation.price;
  useEffect(() => {
    if (container.current) container.current.dataset.priceLevels = "0";
    if (!container.current || !asset?.candles.length) return;
    const chart = createChart(container.current, {
      autoSize: true, height: container.current.clientHeight || (expanded ? 600 : 385),
      layout: { background: { type: ColorType.Solid, color: "#15181b" }, textColor: "#939ca4", fontFamily: "Segoe UI, Malgun Gothic, sans-serif", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: "#22262a" }, horzLines: { color: "#22262a" } },
      rightPriceScale: { borderColor: "#2b3035", scaleMargins: { top: .08, bottom: .22 } },
      timeScale: { borderColor: "#2b3035", rightOffset: 3, timeVisible: false },
      crosshair: { vertLine: { color: "#717c84" }, horzLine: { color: "#717c84" } },
      localization: { locale: "ko-KR" },
    });
    const precision = ["hynix", "samsung"].includes(asset.id) ? 0 : 2;
    const candle = chart.addSeries(CandlestickSeries, { upColor: "#33c58e", downColor: "#ee6b75", wickUpColor: "#33c58e", wickDownColor: "#ee6b75", borderVisible: false,
      priceFormat: { type: "price", precision, minMove: precision ? .01 : 1 } });
    candle.setData(asset.candles);
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: .82, bottom: 0 } });
    volume.setData(asset.candles.map((bar) => ({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? "#33c58e40" : "#ee6b7540" })));
    const colors = ["#65d2a5", "#63b3ef", "#e3bc64", "#cf95bc"];
    if (averages) [5, 20, 60, 120].forEach((days, index) => {
      const line = chart.addSeries(LineSeries, { color: colors[index], lineWidth: 1, lineType: LineType.Curved, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      const values = SMA.calculate({ period: days, values: asset.candles.map((bar) => bar.close) });
      line.setData(values.map((value, i) => ({ time: asset.candles[i + days - 1].time, value })));
    });
    if (bollinger) {
      const bands = BollingerBands.calculate({ period: 20, stdDev: 2, values: asset.candles.map((bar) => bar.close) });
      (["upper", "middle", "lower"] as const).forEach((key) => {
        const line = chart.addSeries(LineSeries, { color: key === "middle" ? "#aac1d170" : "#aac1d1", lineWidth: 1, lineStyle: 2,
          lineType: LineType.Curved, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        line.setData(bands.map((band, i) => ({ time: asset.candles[i + 19].time, value: band[key] })));
      });
    }
    const levels = [{ price: entry, color: watching ? "#8ec9f1" : "#ead084", title: watching ? "관찰" : "검토" }, { price: target, color: "#75dbc0", title: "목표" }, { price: stop, color: "#efaa91", title: "무효" }].filter((level) => level.price != null && Number.isFinite(level.price) && level.price > 0);
    if (levels.length) candle.applyOptions({ autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
      const info = original();
      if (info?.priceRange) info.priceRange = { minValue: Math.min(info.priceRange.minValue, ...levels.map((level) => level.price!)), maxValue: Math.max(info.priceRange.maxValue, ...levels.map((level) => level.price!)) };
      return info;
    } });
    levels.forEach((level) => candle.createPriceLine({ price: level.price!, color: level.color, lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: level.title }));
    container.current.dataset.priceLevels = String(levels.length);
    container.current.dataset.priceMode = levelMode;
    const dates = new Set(asset.candles.map((bar) => bar.time));
    createSeriesMarkers(candle, events.filter((event) => event.assetId === asset.id && dates.has(event.barTime)).reverse().map((event) => ({
      time: event.barTime, position: event.side === "BUY" ? "belowBar" as const : "aboveBar" as const, color: event.side === "BUY" ? "#33c58e" : "#ee6b75",
      shape: event.side === "BUY" ? "arrowUp" as const : "arrowDown" as const, text: event.side === "BUY" ? "BUY" : "SELL",
    })).sort((a, b) => a.time.localeCompare(b.time)));
    const count = periodCandles(asset.candles, period).length;
    const prior = view.current;
    chart.timeScale().setVisibleLogicalRange(prior?.id === asset.id && prior.period === period && prior.resetKey === resetKey && prior.range
      ? prior.range : { from: Math.max(0, asset.candles.length - count), to: asset.candles.length + 2 });
    return () => {
      view.current = { id: asset.id, period, resetKey, range: chart.timeScale().getVisibleLogicalRange() };
      chart.remove();
    };
  }, [asset, period, events, expanded, bollinger, averages, entry, target, stop, watching, levelMode, resetKey]);
  return <div className={`market-chart ${expanded ? "expanded" : ""}`} ref={container} aria-label={`${asset?.name || "시장"} 캔들 차트`}>
    {!asset?.candles.length && <div className="chart-empty">{asset?.error || "시장 데이터 수집 중"}</div>}
  </div>;
}
