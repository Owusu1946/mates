import assert from "node:assert/strict";
import { test } from "node:test";
import { activeMs, finalWords, joinDictation, pauseClock, resumeClock, startClock } from "./dictation.logic.ts";

test("the clock stops while paused and carries on after", () => {
  let clock = startClock(1_000);
  assert.equal(activeMs(clock, 4_000), 3_000);
  clock = pauseClock(clock, 4_000);
  assert.equal(activeMs(clock, 9_000), 3_000);
  assert.equal(pauseClock(clock, 6_000), clock);
  clock = resumeClock(clock, 9_000);
  assert.equal(activeMs(clock, 10_000), 4_000);
  assert.equal(resumeClock(clock, 11_000), clock);
});

test("stopping keeps what was heard, plus the words still finishing", () => {
  const line = "Book a table for two at Santoku on Friday";
  assert.equal(finalWords(line, startClock(0), 0), "");
  const said = finalWords(line, startClock(0), 1_500);
  assert.ok(said.length > 0 && line.startsWith(said));
  assert.equal(finalWords(line, startClock(0), 60_000), line);
});

test("dictated words join what you typed with one space", () => {
  assert.equal(joinDictation("", "Hello there"), "Hello there");
  assert.equal(joinDictation("  ", "Hello"), "Hello");
  assert.equal(joinDictation("Remind me", "to call Kwesi"), "Remind me to call Kwesi");
  assert.equal(joinDictation("Remind me ", "to call Kwesi"), "Remind me to call Kwesi");
  assert.equal(joinDictation("Typed", ""), "Typed");
});
