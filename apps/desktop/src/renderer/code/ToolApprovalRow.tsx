import { memo } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import type { RunItem } from "../data/sampleRuns.ts";

type ToolApprovalRowProps = {
  approval: Extract<RunItem, { type: "approval" }>;
  mateName: string;
  onAnswer: (allow: boolean) => void;
};

/**
 * A command the mate won't run without your OK, in the timeline where it came up (T3 Code's
 * TimelinePendingApprovalRow). The run waits here until you answer.
 */
export const ToolApprovalRow = memo(function ToolApprovalRow({ approval, mateName, onAnswer }: ToolApprovalRowProps) {
  const open = approval.state === "open";
  return (
    <div className={open ? "rounded-xl border border-caution/40 bg-caution-surface p-3" : "px-0.5"}>
      <div className="flex min-h-6 items-center gap-1.5 text-sm">
        <span className="flex size-6 shrink-0 items-center justify-center">
          <Icon name="shield" size={16} className={open ? "text-caution-ink" : "text-ink-soft opacity-80"} />
        </span>
        <span key={approval.state} className={open ? "text-ink" : "animate-fade text-ink-soft"}>
          {open ? `${mateName} wants to run` : approval.state === "allowed" ? "You allowed" : "You said no to"}
        </span>
        <code className="min-w-0 truncate font-mono text-xs text-ink/80">{approval.command}</code>
      </div>
      {open && (
        <>
          <p className="ms-7.5 mt-0.5 text-ink-soft">{approval.reason}</p>
          <div className="ms-7.5 mt-3 flex gap-2">
            <Button size="sm" onClick={() => onAnswer(true)}>
              Allow
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAnswer(false)}>
              Don't run it
            </Button>
          </div>
        </>
      )}
    </div>
  );
});
