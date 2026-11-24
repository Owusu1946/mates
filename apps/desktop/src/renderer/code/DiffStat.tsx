import { memo } from "react";
import { cn } from "../lib/utils.ts";
import { compactCount } from "./diffStat.logic.ts";

/** "+12 −3" in mono, after T3 Code's DiffStatLabel. `aligned` lines counts up in a column. */
export const DiffStat = memo(function DiffStat({ additions, deletions, layout = "inline" }: { additions: number; deletions: number; layout?: "inline" | "aligned" }) {
  return (
    <span
      role="group"
      aria-label={`${additions} additions, ${deletions} deletions`}
      className={cn("font-mono text-2xs tabular-nums", layout === "inline" ? "inline-flex items-center gap-1" : "inline-grid grid-cols-[4ch_4ch] gap-2 text-right")}
    >
      <span aria-hidden="true" className="text-ok-ink">
        +{compactCount(additions)}
      </span>
      <span aria-hidden="true" className="text-danger-ink">
        −{compactCount(deletions)}
      </span>
    </span>
  );
});
