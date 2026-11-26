import { Collapsible } from "@base-ui/react/collapsible";
import { createContext, use, useState } from "react";
import { WorkLogButton, WorkLogList, WorkLogRow } from "../code/WorkLog.tsx";
import { formatElapsed } from "../code/workGroup.logic.ts";
import { Icon } from "../components/ui/Icon.tsx";
import type { Card } from "../data/sampleCrew.ts";
import { tickTextContent } from "../lib/tickTextContent.ts";
import { cn } from "../lib/utils.ts";
import { observeVisibleAnimation } from "../lib/visibleAnimation.ts";
import { activityIcon, activitySummary, workedFor } from "./activity.logic.ts";

/** Zen hides a reply's finished work; Full activity keeps it (Settings → Chat activity). */
export const QuietActivityContext = createContext(true);

type Activity = Extract<Card, { type: "activity" }>;

/**
 * What a reply is doing, and did (rules: activity.logic.ts). While it works: the step it's on,
 * with a light passing over it ("Searching for "kumasi hostels""), and how long it's been, which
 * writes its own text each second so nothing re-renders for it (T3 Code's AgentElapsed). Done: one
 * line, "Worked for 12s · searched 2 times · read 6 sources", opening onto the steps; Zen hides it,
 * as on the phone. Stopped mid-step says so.
 */
export function WorkActivity({ card }: { card: Activity }) {
  const quiet = use(QuietActivityContext);
  const [open, setOpen] = useState(false);
  const start = Date.parse(card.startedAt ?? "");

  if (card.state === "running") {
    const current = card.steps.findLast((step) => !step.done) ?? card.steps.at(-1);
    const label = current?.label ?? card.label;
    return (
      <div className="flex min-h-6 min-w-0 animate-fade items-center gap-1.5 px-0.5 text-sm text-ink-soft" role="status">
        <span className="flex size-6 shrink-0 items-center justify-center">
          <Icon name={activityIcon(label)} size={15} className="text-ink-soft" />
        </span>
        <span ref={observeVisibleAnimation} className="min-w-0 truncate live-shine">
          {label}
        </span>
        {Number.isFinite(start) && <span className="shrink-0 tabular-nums opacity-70" ref={tickTextContent((now) => formatElapsed(now - start), true)} />}
      </div>
    );
  }

  if (quiet && card.state === "done") return null;
  const took = workedFor(card.startedAt, card.finishedAt);
  const summary = activitySummary(card.steps);
  const title = card.state === "stopped" ? "Stopped" : card.state === "error" ? card.label : took ? `Worked for ${took}` : "Worked on it";
  if (!card.steps.length) return <p className="px-1 text-sm text-ink-soft">{title}</p>;
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} render={<section aria-label="Work" />}>
      <Collapsible.Trigger
        render={
          <WorkLogButton
            icon={<Icon name={card.state === "done" ? "check" : "alert"} size={15} className={cn("opacity-80", card.state === "done" ? "text-ink-soft" : "text-danger-ink")} />}
            label={
              <>
                {title}
                {summary && <span className="opacity-70"> · {summary}</span>}
              </>
            }
            trailing={<Icon name="chevronDown" size={14} className={cn("me-1 shrink-0 text-ink-soft transition-[rotate] duration-150", !open && "-rotate-90")} />}
          />
        }
      />
      <Collapsible.Panel className="motion-disclosure" inert={!open}>
        <div className="ms-1 max-h-[min(18rem,50dvh)] overflow-y-auto border-s border-line ps-2">
          <WorkLogList>
            {card.steps.map((step, index) => (
              <WorkLogRow key={index} icon={<Icon name={step.done ? "check" : activityIcon(step.label)} size={14} className="text-ink-soft opacity-80" />} label={step.label} />
            ))}
          </WorkLogList>
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
