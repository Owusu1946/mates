/**
 * The rules behind What mates did, Routines and Friends, as the phone has them
 * (apps/mobile/app/(app)/feed.tsx, routine.tsx, friends.tsx, friend.tsx): when things happened, in
 * words; a routine's schedule and next run; and what a friend's mate may do with yours.
 */

// ── What mates did ────────────────────────────────────────────────────────────────────────

export type ActivityStatus = "done" | "working" | "needsYou" | "failed";
export type ActivityFilter = "all" | "needsYou" | "done";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const startOfDay = (time: number) => {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};

/** "just now", "12 min ago", "3 h ago", "yesterday", "12 Nov", as the phone says it. */
export function timeAgo(at: number, now: number): string {
  const minutes = Math.floor((now - at) / MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (startOfDay(at) === startOfDay(now)) return `${Math.floor(minutes / 60)} h ago`;
  if (startOfDay(at) === startOfDay(now) - DAY) return "yesterday";
  const date = new Date(at);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** The heading a day's items sit under. */
export function dayLabel(at: number, now: number): string {
  if (startOfDay(at) === startOfDay(now)) return "Today";
  if (startOfDay(at) === startOfDay(now) - DAY) return "Yesterday";
  const date = new Date(at);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Items newest first, under their days, narrowed by the filter. Needs you includes what's still running. */
export function groupActivity<T extends { at: number; status: ActivityStatus }>(items: T[], filter: ActivityFilter, now: number): { day: string; items: T[] }[] {
  const shown = items
    .filter((item) => filter === "all" || (filter === "done" ? item.status === "done" : item.status === "needsYou"))
    .sort((a, b) => b.at - a.at);
  const groups: { day: string; items: T[] }[] = [];
  for (const item of shown) {
    const day = dayLabel(item.at, now);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

// ── Routines ──────────────────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** "Every day at 7:00", "Weekdays at 7:00", "Mondays and Thursdays at 9:30". */
export function scheduleText(days: number[], time: string): string {
  const set = [...new Set(days)].sort();
  const when =
    set.length === 7 ? "Every day"
    : set.join() === "1,2,3,4,5" ? "Weekdays"
    : set.join() === "0,6" ? "Weekends"
    : set.length === 0 ? "Never"
    : set.length === 1 ? DAY_NAMES[set[0]!]!
    : `${set.slice(0, -1).map((day) => DAY_NAMES[day]).join(", ")} and ${DAY_NAMES[set.at(-1)!]}`;
  return set.length ? `${when} at ${time}` : when;
}

/** When a routine runs next, or null when it's off or has no days. */
export function nextRun(days: number[], time: string, on: boolean, now: number): number | null {
  if (!on || days.length === 0) return null;
  const [hours, minutes] = time.split(":").map(Number);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const candidate = new Date(startOfDay(now) + ahead * DAY);
    candidate.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    if (days.includes(candidate.getDay()) && candidate.getTime() > now) return candidate.getTime();
  }
  return null;
}

// ── Friends ───────────────────────────────────────────────────────────────────────────────

export type FriendGrants = { freeTime: boolean; updates: boolean; answers: boolean };

/** One line for what a friend's mate may do without asking, as the phone writes it. */
export function grantSummary(grants: FriendGrants): string {
  const can = [grants.freeTime && "see when you're free", grants.updates && "pass on updates", grants.answers && "get answers from your mate"].filter((part): part is string => Boolean(part));
  if (!can.length) return "Asks you before anything";
  const list = can.length === 1 ? can[0]! : `${can.slice(0, -1).join(", ")} and ${can.at(-1)}`;
  return `Can ${list}`;
}

export type InviteCheck = "ok" | "invalid" | "yourself" | "friends" | "asked" | "notOnMates";

/** What happens when you invite someone by email, with the phone's messages for each case. */
export function checkInvite(email: string, { me, friends, asked, onMates }: { me: string; friends: string[]; asked: string[]; onMates: string[] }): InviteCheck {
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return "invalid";
  if (address === me.toLowerCase()) return "yourself";
  if (friends.includes(address)) return "friends";
  if (asked.includes(address)) return "asked";
  return onMates.includes(address) ? "ok" : "notOnMates";
}

export const INVITE_MESSAGE: Record<InviteCheck, string> = {
  ok: "Request sent. They'll see it in Friends.",
  invalid: "That doesn't look like an email.",
  yourself: "That's your own email.",
  friends: "You're already friends.",
  asked: "You've already asked them. Waiting for them to accept.",
  notOnMates: "They're not on Mates yet.",
};
