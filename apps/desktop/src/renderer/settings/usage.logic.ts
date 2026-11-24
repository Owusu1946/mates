/**
 * Your usage, as the app counts it (apps/api/src/usage/plans.ts): a share of your plan's budget in
 * two windows, a 5-hour session (not on Max) and a week, shown only as percentages. Chats, calls,
 * the computer and coding all draw on the same budget. Like Claude's usage page, it warns you when
 * your pace would reach the limit before it resets.
 */

export type PlanId = "starter" | "plus" | "pro" | "max";
export type UsageWindow = { usedPercent: number; startedAt: number | null; resetsAt: number | null };

export const PLANS: { id: PlanId; label: string; multiple: string }[] = [
  { id: "starter", label: "Starter", multiple: "1×" },
  { id: "plus", label: "Plus", multiple: "2×" },
  { id: "pro", label: "Pro", multiple: "6×" },
  { id: "max", label: "Max", multiple: "12×" },
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" });

const startOfDay = (at: number) => {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};
const clock = (at: number) => time.format(at).replace(/\s?([ap]m)$/i, (_, half: string) => ` ${half.toUpperCase()}`);

/** "2 h 10 m", "45 m", "1 m". */
export function inWords(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} m` : `${minutes} m`;
}

/** As the phone says it: "Resets at 11:30 PM · in 2 h 10 m" today, "Resets Monday 3:00 PM" later. */
export function resetText(window: UsageWindow, now: number): string {
  if (window.resetsAt === null) return "Starts with your next use";
  if (startOfDay(window.resetsAt) === startOfDay(now)) return `Resets at ${clock(window.resetsAt)} · in ${inWords(window.resetsAt - now)}`;
  return `Resets ${weekday.format(window.resetsAt)} ${clock(window.resetsAt)}`;
}

export type UsageLevel = "ok" | "high" | "limit";
export const usageLevel = (percent: number): UsageLevel => (percent >= 100 ? "limit" : percent >= 75 ? "high" : "ok");

const partOfDay = (at: number) => {
  const hour = new Date(at).getHours();
  return hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
};

/**
 * "Heads up. At this pace you'll reach your weekly limit Thursday morning, before Monday's reset."
 * Null when the pace is fine, the limit's already reached, or there's too little to go on.
 */
export function paceWarning(window: UsageWindow, now: number, label = "weekly"): string | null {
  const { usedPercent, startedAt, resetsAt } = window;
  if (startedAt === null || resetsAt === null || usedPercent <= 0 || usedPercent >= 100) return null;
  const elapsed = now - startedAt;
  if (elapsed < HOUR) return null;
  const reachesAt = now + ((100 - usedPercent) / usedPercent) * elapsed;
  if (reachesAt >= resetsAt) return null;
  const when = startOfDay(reachesAt) === startOfDay(now) ? `today, around ${clock(reachesAt)}` : startOfDay(reachesAt) - startOfDay(now) === DAY ? `tomorrow ${partOfDay(reachesAt)}` : `${weekday.format(reachesAt)} ${partOfDay(reachesAt)}`;
  return `Heads up. At this pace you'll reach your ${label} limit ${when}, before ${weekday.format(resetsAt)}'s reset.`;
}
