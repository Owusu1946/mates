import type { Card, Source } from "../../data/sampleCrew.ts";

/** The rules behind the chat cards: what each one says about itself. */

type Plan = Extract<Card, { type: "plan" }>;

/** The actions you've left ticked, which are the ones that run. */
export const chosenActions = (plan: Plan) => plan.actions.filter((action) => action.selected);

/** The plan's line under its title: what's waiting, what's happening, or what happened. */
export function planSummary(plan: Plan): string {
  const chosen = chosenActions(plan).length;
  const done = plan.actions.filter((action) => action.status === "done").length;
  const things = (count: number) => (count === 1 ? "1 thing" : `${count} things`);
  if (plan.state === "review") return chosen === plan.actions.length ? `${things(chosen)} to do, with your OK` : `${chosen} of ${plan.actions.length} chosen`;
  if (plan.state === "running") return `Doing ${done + 1} of ${chosen}`;
  if (plan.state === "declined") return "You said not now";
  return `Did ${things(done)}`;
}

/** Up to three different sites for the pill's icons, and how many sources in all. */
export function sourcesPill(sources: Source[]): { domains: string[]; label: string } {
  // Up to four different sites, as the phone shows (sources-card.tsx).
  const domains = [...new Set(sources.map((source) => source.domain))].slice(0, 4);
  return { domains, label: sources.length === 1 ? "1 source" : `${sources.length} sources` };
}

export function memoryLabel(card: Extract<Card, { type: "memory" }>): string {
  if (card.undone) return "Memory removed";
  return card.action === "forgotten" ? "Forgot that" : card.action === "saved" ? "Memory saved" : "Memory updated";
}

/** How a watch keeps checking: on a schedule for the web, or waiting on an app's event. */
export function watchCadence(card: Extract<Card, { type: "watch" }>): string {
  if (card.app) return `Waits for ${card.app}`;
  return card.every ? `Checks ${card.every}` : "Checks now and then";
}
