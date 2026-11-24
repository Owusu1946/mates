import assert from "node:assert/strict";
import { test } from "node:test";
import { formatClock, heardSoFar, MIN_HOLD_MS, releaseOutcome } from "./holdToTalk.logic.ts";

test("a tap isn't a hold", () => {
  assert.equal(releaseOutcome(MIN_HOLD_MS - 1), "tooShort");
  assert.equal(releaseOutcome(MIN_HOLD_MS), "send");
});

test("words appear at speaking pace, a beat after you start", () => {
  const line = "find me hostels near KNUST under four thousand";
  assert.equal(heardSoFar(line, 200), "");
  assert.equal(heardSoFar(line, 450), "find");
  assert.equal(heardSoFar(line, 1500), "find me hostels");
  assert.equal(heardSoFar(line, 60_000), line);
});

test("the clock reads minutes and seconds", () => {
  assert.equal(formatClock(4200), "0:04");
  assert.equal(formatClock(72_000), "1:12");
  assert.equal(formatClock(-1), "0:00");
});
