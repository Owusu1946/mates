import assert from "node:assert/strict";
import { test } from "node:test";
import { inWords, paceWarning, resetText, usageLevel } from "./usage.logic.ts";

// Tuesday 24 November 2026, 10:00 local time.
const now = new Date(2026, 10, 24, 10, 0).getTime();
const HOUR = 3_600_000;

test("resets read as the phone says them", () => {
  assert.equal(resetText({ usedPercent: 59, startedAt: now - HOUR, resetsAt: now + 2 * HOUR + 10 * 60_000 }, now), "Resets at 12:10 PM · in 2 h 10 m");
  assert.equal(resetText({ usedPercent: 45, startedAt: now, resetsAt: new Date(2026, 10, 30, 15, 0).getTime() }, now), "Resets Monday 3:00 PM");
  assert.equal(resetText({ usedPercent: 0, startedAt: null, resetsAt: null }, now), "Starts with your next use");
  assert.equal(inWords(45 * 60_000), "45 m");
});

test("high usage is flagged from 75%, and the limit at 100%", () => {
  assert.equal(usageLevel(40), "ok");
  assert.equal(usageLevel(80), "high");
  assert.equal(usageLevel(100), "limit");
});

test("a pace that would hit the limit before the reset gets a heads-up", () => {
  // 45% in 2 days is about 22% a day: full by Thursday, well before next Monday's reset.
  const week = { usedPercent: 45, startedAt: now - 48 * HOUR, resetsAt: new Date(2026, 10, 30, 15, 0).getTime() };
  assert.equal(paceWarning(week, now), "Heads up. At this pace you'll reach your weekly limit Thursday evening, before Monday's reset.");
  // 10% in 2 days is fine.
  assert.equal(paceWarning({ ...week, usedPercent: 10 }, now), null);
  assert.equal(paceWarning({ ...week, usedPercent: 100 }, now), null, "already at the limit");
  assert.equal(paceWarning({ usedPercent: 0, startedAt: null, resetsAt: null }, now), null);
});
