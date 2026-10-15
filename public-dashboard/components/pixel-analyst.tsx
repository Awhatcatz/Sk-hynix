"use client";
import type { AnalystId } from "../lib/council-contract";

export default function PixelAnalyst({ index, id, working = false }: { index: number; id: AnalystId; working?: boolean }) {
  return <span className={`pixel-workstation work-${id} ${working ? "is-working" : ""}`} aria-hidden="true">
    <span className="analyst-avatar" style={{ backgroundPosition: `${index * 25}% 50%` }} />
    <span className="pixel-desk"><i /><i /><i /><i /><i /></span>
    <span className="pixel-work-mark"><i /><i /><i /></span>
  </span>;
}
