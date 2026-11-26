import { formatElapsed } from "../code/workGroup.logic.ts";

/**
 * A reply's progress line, from its steps (the API's activity list: apps/api agent-chat.ts and
 * web-search.ts). Web search writes `Searching for "…"`, `Reading 4 sources` and `Reading a.com
 * and b.com`; other work writes what it's doing ("Checking your inbox").
 */

export type ActivityIcon = "search" | "eye" | "wrench";

/** The icon for a step, from what it says it's doing. */
export function activityIcon(label: string): ActivityIcon {
  if (/^searching\b/i.test(label)) return "search";
  if (/^reading\b/i.test(label)) return "eye";
  return "wrench";
}

/** How the work went, in a few words: "searched 2 times · read 6 sources". */
export function activitySummary(steps: readonly { label: string }[]): string {
  const searches = steps.filter((step) => /^searching for\b/i.test(step.label)).length;
  const read = steps.reduce((total, step) => total + Number(step.label.match(/^reading (\d+) sources?\b/i)?.[1] ?? 0), 0);
  return [searches ? (searches === 1 ? "searched once" : `searched ${searches} times`) : "", read ? `read ${read === 1 ? "1 source" : `${read} sources`}` : ""].filter(Boolean).join(" · ");
}

/** The time it took, at least a second, or null without both times (older replies). */
export function workedFor(startedAt: string | undefined, finishedAt: string | undefined): string | null {
  const start = Date.parse(startedAt ?? "");
  const end = Date.parse(finishedAt ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return formatElapsed(Math.max(1000, end - start));
}
