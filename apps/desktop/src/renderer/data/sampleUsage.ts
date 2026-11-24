import type { PlanId, UsageWindow } from "../settings/usage.logic.ts";

/**
 * The sample workspace's usage, until it comes from the API's usage endpoint: Pro, partway
 * through its 5-hour session and its week. The week resets Monday at 3pm, as a real window does
 * seven days after it started.
 */

const now = Date.now();
const HOUR = 3_600_000;

function nextMondayAt3pm(from: number) {
  const date = new Date(from);
  date.setHours(15, 0, 0, 0);
  let days = (8 - date.getDay()) % 7;
  // Monday already past 3pm: the next one.
  if (days === 0 && date.getTime() <= from) days = 7;
  date.setDate(date.getDate() + days);
  return date.getTime();
}

const weekResets = nextMondayAt3pm(now);

export const USAGE: { plan: PlanId; session: UsageWindow; week: UsageWindow } = {
  plan: "pro",
  session: { usedPercent: 59, startedAt: now - 2 * HOUR - 50 * 60_000, resetsAt: now + 2 * HOUR + 10 * 60_000 },
  week: { usedPercent: 45, startedAt: weekResets - 7 * 24 * HOUR, resetsAt: weekResets },
};
