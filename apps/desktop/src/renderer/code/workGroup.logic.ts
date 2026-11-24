import type { Step, StepKind } from "../data/sampleRuns.ts";

/**
 * How a mate's steps read in the timeline: one icon per kind, the folded group's summary, and
 * elapsed times (T3 Code's TimelineWorkEntryRow.logic and AgentElapsed).
 */

export type StepIcon = "brain" | "eye" | "search" | "pen" | "terminal" | "wrench";

const ICON_FOR: Record<StepKind, StepIcon> = { think: "brain", read: "eye", search: "search", edit: "pen", command: "terminal" };

export const stepIcon = (kind: StepKind): StepIcon => ICON_FOR[kind];

/** The group's icon: the kind every step shares, or a wrench for a mix (T3: "mixed" → hammer). */
export function groupIcon(steps: Step[]): StepIcon {
  const kinds = new Set(steps.map((step) => step.kind));
  return kinds.size === 1 ? ICON_FOR[steps[0]!.kind] : "wrench";
}

/** 12s · 1m 05s · 1h 02m */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return `${seconds}s`;
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "read 4 files, edited 3, ran 2 commands": what a folded group did, in the order a mate works. */
export function groupSummary(steps: Step[]): string {
  const count = (kind: StepKind) => steps.filter((step) => step.kind === kind).length;
  const parts = [
    count("read") && `read ${plural(count("read"), "file", "files")}`,
    count("search") && `searched ${plural(count("search"), "time", "times")}`,
    count("edit") && `edited ${count("read") ? count("edit") : plural(count("edit"), "file", "files")}`,
    count("command") && `ran ${plural(count("command"), "command", "commands")}`,
  ].filter((part): part is string => Boolean(part));
  return parts.join(", ");
}
