import { memo, useState } from "react";
import { Icon } from "../components/ui/Icon.tsx";
import type { Step } from "../data/sampleRuns.ts";
import { tickTextContent } from "../lib/tickTextContent.ts";
import { observeVisibleAnimation } from "../lib/visibleAnimation.ts";
import { cn } from "../lib/utils.ts";
import { LiveThought } from "./LiveThought.tsx";
import type { LiveGroup } from "./runPlayer.logic.ts";
import { StepIcon, StepLabel, WorkEntryRow } from "./WorkEntryRow.tsx";
import { WorkLogButton, WorkLogList } from "./WorkLog.tsx";
import { formatElapsed, groupIcon, groupSummary } from "./workGroup.logic.ts";

/** An open group's steps, in a list that scrolls past 18rem (T3 Code: min(18rem, 50dvh)). */
function StepList({ steps }: { steps: Step[] }) {
  return (
    <div className="ms-1 max-h-[min(18rem,50dvh)] overflow-y-auto border-s border-line ps-2">
      <WorkLogList>
        {steps.map((step) => (
          <WorkEntryRow key={step.id} step={step} />
        ))}
      </WorkLogList>
    </div>
  );
}

/** A finished turn's steps folded into one row: "Worked for 1m 12s · read 4 files, edited 3". */
export const WorkGroup = memo(function WorkGroup({ steps, durationMs }: { steps: Step[]; durationMs: number }) {
  const [open, setOpen] = useState(false);
  const summary = groupSummary(steps);
  return (
    <section aria-label="Work">
      <WorkLogButton
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        icon={<Icon name={groupIcon(steps)} size={16} className="text-ink-soft opacity-80" />}
        label={
          <>
            Worked for {formatElapsed(durationMs)}
            {summary && <span className="opacity-70"> · {summary}</span>}
          </>
        }
        trailing={<Icon name="chevronDown" size={14} className={cn("me-1 shrink-0 text-ink-soft transition-[rotate] duration-150", !open && "-rotate-90")} />}
      />
      {open && <StepList steps={steps} />}
    </section>
  );
});

/**
 * The turn in progress (T3 Code's WorkingTimelineRow and LiveActivityRow): "Working for 12s",
 * the steps so far, open while it works (fold them with the toggle), and the current step: a
 * thought streams in as the mate reasons, a tool call has a light passing over it. The timer
 * writes its own text every second; nothing re-renders for it.
 */
export function LiveWorkGroup({ group }: { group: LiveGroup }) {
  const [open, setOpen] = useState(true);
  const { startedAt, steps, current } = group;
  return (
    <section aria-label="Working" className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        disabled={!steps.length}
        onClick={() => setOpen(!open)}
        className="flex h-6 w-fit items-center gap-1.5 rounded-md px-1 text-sm text-ink-soft tabular-nums outline-none hover:not-disabled:text-ink focus-visible:ring-2 focus-visible:ring-brand/70"
      >
        <span>
          Working for <span ref={tickTextContent((now) => formatElapsed(now - startedAt), true)} />
        </span>
        {steps.length > 0 && (
          <>
            <span className="opacity-70">· {steps.length === 1 ? "1 step" : `${steps.length} steps`}</span>
            <Icon name="chevronDown" size={14} className={cn("transition-[rotate] duration-150", !open && "-rotate-90")} />
          </>
        )}
      </button>
      {open && <StepList steps={steps} />}
      {current?.thought && <LiveThought key={current.id} thought={current.thought} ms={current.ms} />}
      {current && !current.thought && (
        <div className="flex min-h-6 min-w-0 animate-fade items-center gap-1.5 px-0.5 text-sm leading-relaxed" role="status">
          <span className="flex size-6 shrink-0 items-center justify-center">
            <StepIcon step={current} highlighted />
          </span>
          <span ref={observeVisibleAnimation} className="min-w-0 truncate">
            <StepLabel step={current} className="live-shine" />
          </span>
        </div>
      )}
    </section>
  );
}
