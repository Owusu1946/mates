import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { findSlots, type Person } from "./slots.js";

const ACCRA = "Africa/Accra";
const LONDON = "Europe/London";
// Monday 23 November 2026, 09:00 in Accra (UTC+0).
const NOW = DateTime.fromISO("2026-11-23T09:00", { zone: ACCRA }).toMillis();
const at = (iso: string, zone = ACCRA) => DateTime.fromISO(iso, { zone }).toMillis();
const local = (ms: number, zone = ACCRA) => DateTime.fromMillis(ms, { zone }).toFormat("ccc HH:mm");
const week = { from: NOW, to: at("2026-11-29T23:59") };
const free = (timezone = ACCRA): Person => ({ timezone, busy: [] });

describe("findSlots", () => {
  it("offers lunch at lunchtime on three different days, soonest first", () => {
    const slots = findSlots({ kind: "lunch", durationMin: 60, now: NOW, ...week, people: [free(), free()] });
    expect(slots.map((s) => local(s.start))).toEqual(["Mon 12:30", "Tue 12:30", "Wed 12:30"]);
    expect(slots[0]!.reason).toBe("Free for everyone · soonest");
  });

  it("works around existing events with a gap either side", () => {
    const busy = { start: at("2026-11-23T12:00"), end: at("2026-11-23T13:00") };
    const slots = findSlots({ kind: "lunch", durationMin: 60, now: NOW, ...week, people: [free(), { timezone: ACCRA, busy: [busy] }] }, 7);
    const monday = slots.find((s) => local(s.start).startsWith("Mon"));
    // 13:00 + 15 minutes' gap; nothing touching 11:45–13:15.
    expect(monday && local(monday.start)).toBe("Mon 13:15");
  });

  it("leaves a bigger gap when there's somewhere to get to", () => {
    const busy = { start: at("2026-11-23T12:00"), end: at("2026-11-23T13:00") };
    const slots = findSlots({ kind: "lunch", durationMin: 60, now: NOW, ...week, inPerson: true, people: [free(), { timezone: ACCRA, busy: [busy] }] }, 7);
    const monday = slots.find((s) => local(s.start).startsWith("Mon"));
    expect(monday && local(monday.start)).toBe("Mon 13:30");
  });

  it("keeps calls on weekdays and brunch on weekends", () => {
    expect(findSlots({ kind: "call", durationMin: 30, now: NOW, ...week, people: [free()] }, 10).every((s) => !["Sat", "Sun"].includes(local(s.start).slice(0, 3)))).toBe(true);
    expect(findSlots({ kind: "brunch", durationMin: 90, now: NOW, ...week, people: [free()] }).map((s) => local(s.start).slice(0, 3))).toEqual(["Sat", "Sun"]);
  });

  it("respects each person's own local time and quiet hours", () => {
    // A London friend in winter is on the same clock; their quiet hours from 19:00 rule out dinner.
    const slots = findSlots({ kind: "dinner", durationMin: 90, now: NOW, ...week, people: [free(), { timezone: LONDON, busy: [], quiet: { start: 19, end: 8 } }] });
    expect(slots).toEqual([]);
  });

  it("never offers a time outside someone's waking hours across timezones", () => {
    // Breakfast at 07:30 in Accra is 02:30 in New York.
    const slots = findSlots({ kind: "breakfast", durationMin: 60, now: NOW, ...week, people: [free(), free("America/New_York")] });
    expect(slots).toEqual([]);
  });

  it("is honest when it can't see someone's calendar", () => {
    const slots = findSlots({ kind: "coffee", durationMin: 45, now: NOW, ...week, people: [free(), { timezone: ACCRA, busy: null }] });
    expect(slots[0]!.reason.startsWith("Free for you")).toBe(true);
  });

  it("doesn't offer anything within the next hour", () => {
    const now = at("2026-11-23T12:00");
    const slots = findSlots({ kind: "lunch", durationMin: 60, now, from: now, to: at("2026-11-23T23:00"), people: [free()] }, 5);
    expect(slots.every((s) => s.start >= now + 3_600_000)).toBe(true);
  });

  it("finds nothing when everyone's busy all week", () => {
    const busy = { start: week.from, end: week.to };
    expect(findSlots({ kind: "lunch", durationMin: 60, now: NOW, ...week, people: [free(), { timezone: ACCRA, busy: [busy] }] })).toEqual([]);
  });
});
