import { cn } from "../lib/utils.ts";
import { usageLevel } from "./usage.logic.ts";

const FILL = { ok: "bg-brand", high: "bg-caution", limit: "bg-danger" } as const;

/** How much of a window is used: a bar that turns amber from 75% and red at the limit. */
export function UsageBar({ percent, className }: { percent: number; className?: string }) {
  const level = usageLevel(percent);
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className={cn("h-1.5 overflow-hidden rounded-full bg-hover-fill", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out-soft", FILL[level])} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

/** "59% used", or "Limit reached". */
export const usedText = (percent: number) => (percent >= 100 ? "Limit reached" : `${Math.round(percent)}% used`);
