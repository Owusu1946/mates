import { DateTime } from "luxon";

/**
 * Finds the best few times for people to meet: inside sensible hours for what it is, outside
 * everyone's quiet hours and existing events (with a gap either side), soon but not rushed, and
 * spread over different days so there's a real choice. Pure: no calendars, no clock of its own.
 */

export const MEETING_KINDS = ["lunch", "dinner", "breakfast", "coffee", "drinks", "brunch", "call", "meeting", "other"] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export type Interval = { start: number; end: number };
export type Person = {
  timezone: string;
  /** Known busy times; null when we can't see their calendar (it's their pick, then). */
  busy: Interval[] | null;
  /** Hours (0–23) their phone is quiet, e.g. 22 → 8. */
  quiet?: { start: number; end: number };
};
export type SlotRequest = {
  kind: MeetingKind;
  durationMin: number;
  /** The window to look in, as instants. */
  from: number;
  to: number;
  now: number;
  /** The organiser first: the kind's hours are read in their local time. */
  people: Person[];
  /** A place to get to means a bigger gap around other events. */
  inPerson?: boolean;
};
export type Slot = { start: number; end: number; reason: string };

type Window = { from: number; to: number };
/** Each kind's hours (in minutes from midnight), its ideal start, and which days suit it. */
const HOURS: Record<MeetingKind, { windows: Window[]; ideal: number; days: "any" | "weekdays" | "weekends" }> = {
  breakfast: { windows: [{ from: 7 * 60 + 30, to: 10 * 60 }], ideal: 8 * 60 + 30, days: "any" },
  coffee: { windows: [{ from: 8 * 60, to: 11 * 60 }, { from: 15 * 60, to: 17 * 60 }], ideal: 10 * 60, days: "any" },
  brunch: { windows: [{ from: 10 * 60, to: 13 * 60 }], ideal: 11 * 60, days: "weekends" },
  lunch: { windows: [{ from: 11 * 60 + 30, to: 14 * 60 + 30 }], ideal: 12 * 60 + 30, days: "any" },
  drinks: { windows: [{ from: 17 * 60 + 30, to: 21 * 60 }], ideal: 18 * 60 + 30, days: "any" },
  dinner: { windows: [{ from: 18 * 60, to: 21 * 60 }], ideal: 19 * 60, days: "any" },
  call: { windows: [{ from: 9 * 60, to: 18 * 60 }], ideal: 11 * 60, days: "weekdays" },
  meeting: { windows: [{ from: 9 * 60, to: 18 * 60 }], ideal: 11 * 60, days: "weekdays" },
  other: { windows: [{ from: 9 * 60, to: 20 * 60 }], ideal: 12 * 60, days: "any" },
};
/** Nobody gets offered a time outside this, in their own local time, whatever the kind. */
const AWAKE = { from: 7 * 60, to: 22 * 60 };
const STEP_MIN = 15;
const LEAD_MIN = 60;

const minutesOfDay = (at: DateTime) => at.hour * 60 + at.minute;

function inQuiet(minute: number, quiet?: { start: number; end: number }) {
  if (!quiet || quiet.start === quiet.end) return false;
  const start = quiet.start * 60;
  const end = quiet.end * 60;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Whether this person can make [start, end): awake, not in quiet hours, free with a gap either side. */
function fits(person: Person, start: number, end: number, gapMs: number) {
  const localStart = DateTime.fromMillis(start, { zone: person.timezone });
  const localEnd = DateTime.fromMillis(end, { zone: person.timezone });
  if (!localStart.hasSame(localEnd.minus({ minutes: 1 }), "day")) return false;
  const from = minutesOfDay(localStart);
  const to = minutesOfDay(localEnd) || 24 * 60;
  if (from < AWAKE.from || to > AWAKE.to) return false;
  if (inQuiet(from, person.quiet) || inQuiet(to - 1, person.quiet)) return false;
  return !(person.busy ?? []).some((busy) => busy.start < end + gapMs && busy.end > start - gapMs);
}

export function findSlots(request: SlotRequest, count = 3): Slot[] {
  const organiser = request.people[0];
  if (!organiser || request.durationMin <= 0) return [];
  const hours = HOURS[request.kind];
  const durationMs = request.durationMin * 60_000;
  const gapMs = (request.inPerson ? 30 : 15) * 60_000;
  const earliest = Math.max(request.from, request.now + LEAD_MIN * 60_000);
  const candidates: (Slot & { score: number; day: string })[] = [];

  let day = DateTime.fromMillis(earliest, { zone: organiser.timezone }).startOf("day");
  const lastDay = DateTime.fromMillis(request.to, { zone: organiser.timezone }).startOf("day");
  for (let d = 0; day <= lastDay && d < 31; d++, day = day.plus({ days: 1 })) {
    const weekend = day.weekday >= 6;
    if ((hours.days === "weekdays" && weekend) || (hours.days === "weekends" && !weekend)) continue;
    for (const window of hours.windows) {
      for (let minute = window.from; minute + request.durationMin <= window.to; minute += STEP_MIN) {
        const start = day.plus({ minutes: minute }).toMillis();
        const end = start + durationMs;
        if (start < earliest || end > request.to) continue;
        if (!request.people.every((person) => fits(person, start, end, gapMs))) continue;
        const daysAhead = (start - request.now) / 86_400_000;
        // Closeness to the ideal hour matters most, then sooner over later.
        const score = Math.abs(minute - hours.ideal) / 30 + daysAhead * 0.6;
        candidates.push({ start, end, score, day: day.toISODate()!, reason: "" });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score || a.start - b.start);
  // Different days first, so the choice is real; then the same day, at least two hours apart.
  const picked: typeof candidates = [];
  for (const candidate of candidates) {
    if (picked.length >= count) break;
    if (!picked.some((p) => p.day === candidate.day)) picked.push(candidate);
  }
  for (const candidate of candidates) {
    if (picked.length >= count) break;
    if (!picked.includes(candidate) && picked.every((p) => Math.abs(p.start - candidate.start) >= 2 * 3_600_000)) picked.push(candidate);
  }

  const everyoneKnown = request.people.every((person) => person.busy !== null);
  const soonest = Math.min(...picked.map((p) => p.start));
  return picked
    .sort((a, b) => a.start - b.start)
    .map(({ start, end }) => ({
      start,
      end,
      reason: [everyoneKnown ? "Free for everyone" : "Free for you", start === soonest ? "soonest" : null].filter(Boolean).join(" · "),
    }));
}
