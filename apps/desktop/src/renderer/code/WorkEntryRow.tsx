import { Collapsible } from "@base-ui/react/collapsible";
import { memo, useState } from "react";
import { Icon } from "../components/ui/Icon.tsx";
import { OUTPUTS, PATCHES, type Step } from "../data/sampleRuns.ts";
import { cn } from "../lib/utils.ts";
import { CommandOutput } from "./CommandOutput.tsx";
import { DiffStat } from "./DiffStat.tsx";
import { patchStat } from "./diffStat.logic.ts";
import { PatchPreview } from "./PatchPreview.tsx";
import { splitThought, thoughtLine } from "./thought.logic.ts";
import { ThoughtText } from "./ThoughtText.tsx";
import { WorkLogDetails, WorkLogRow } from "./WorkLog.tsx";
import { stepIcon } from "./workGroup.logic.ts";

/**
 * "Read `apps/mobile/app/sign-in.tsx`": the step's verb, then its path or command in mono. A
 * thought reads as its heading.
 */
export function StepLabel({ step, className }: { step: Step; className?: string }) {
  if (step.thought) return <span className={className}>{thoughtLine(step.thought)}</span>;
  return (
    <span className={className}>
      {step.label}
      {step.target && <code className="ms-1.5 font-mono text-xs text-ink/80">{step.target}</code>}
    </span>
  );
}

export function StepIcon({ step, highlighted = false }: { step: Step; highlighted?: boolean }) {
  return <Icon name={stepIcon(step.kind)} size={16} className={cn(step.failed ? "text-danger-ink" : highlighted ? "text-ink" : "text-ink-soft opacity-80")} />;
}

/**
 * One settled step (T3 Code's SimpleWorkEntryRow). A thought opens to its reasoning, a command to
 * its output and an edit to its change; what they show is looked up only when opened.
 */
export const WorkEntryRow = memo(function WorkEntryRow({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);
  const patch = step.patchId ? PATCHES[step.patchId] : undefined;
  const expandable = Boolean(step.outputId || patch || step.thought);
  const stat = patch ? patchStat(patch.path, patch.patch) : null;
  const toggle = () => setOpen((value) => !value);

  return (
    <WorkLogRow
      icon={<StepIcon step={step} />}
      label={<StepLabel step={step} />}
      trailing={
        <span className="flex shrink-0 items-center gap-1.5">
          {step.failed && <span className="text-2xs text-danger-ink">failed</span>}
          {stat && <DiffStat additions={stat.additions} deletions={stat.deletions} />}
          {expandable && <Icon name="chevronDown" size={14} className={cn("text-ink-soft transition-[rotate] duration-150", !open && "-rotate-90")} />}
        </span>
      }
      toggle={
        expandable
          ? {
              role: "button",
              tabIndex: 0,
              "aria-expanded": open,
              onClick: toggle,
              onKeyDown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle();
                }
              },
            }
          : undefined
      }
    >
      {expandable && (
        <Collapsible.Root open={open} className="contents">
          <Collapsible.Panel className="motion-disclosure" inert={!open}>
            {step.thought && (
              <WorkLogDetails>
                <ThoughtText body={splitThought(step.thought).body} />
              </WorkLogDetails>
            )}
            {step.outputId && (
              <WorkLogDetails kind="panel">
                <CommandOutput text={OUTPUTS[step.outputId] ?? ""} />
              </WorkLogDetails>
            )}
            {patch && (
              <WorkLogDetails kind="panel">
                <PatchPreview patch={patch.patch} />
              </WorkLogDetails>
            )}
          </Collapsible.Panel>
        </Collapsible.Root>
      )}
    </WorkLogRow>
  );
});
