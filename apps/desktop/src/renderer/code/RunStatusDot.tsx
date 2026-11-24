import { cn } from "../lib/utils.ts";
import type { RunStatus } from "./runPlayer.logic.ts";

const LABEL: Record<RunStatus, string> = { working: "Working", waiting: "Needs you", done: "Done", ready: "Ready" };

/** A run's state as a dot: working pulses in steps, waiting is amber, done is green. */
export function RunStatusDot({ status }: { status: RunStatus }) {
  return (
    <span role="img" aria-label={LABEL[status]} className="flex size-4 shrink-0 items-center justify-center">
      <span className={cn("size-1.5 rounded-full", status === "working" && "status-pulse bg-brand", status === "waiting" && "bg-caution", status === "done" && "bg-ok", status === "ready" && "bg-ink-soft")} />
    </span>
  );
}
