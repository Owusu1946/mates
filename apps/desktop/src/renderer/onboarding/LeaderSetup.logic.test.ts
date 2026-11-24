import assert from "node:assert/strict";
import { test } from "node:test";
import { dayNameFor, isValidName, nameHint, nextDayName } from "./LeaderSetup.logic.ts";

test("the lead mate is named for today to start", () => {
  assert.equal(dayNameFor(new Date(2026, 10, 23)), "Kojo"); // a Monday
  assert.equal(dayNameFor(new Date(2026, 10, 22)), "Kwesi"); // a Sunday
});

test("shuffle walks the week, starting after today for a name of their own", () => {
  assert.equal(nextDayName("Kojo", 1), "Kwabena");
  assert.equal(nextDayName("kwame", 1), "Kwesi");
  assert.equal(nextDayName("Ada", 1), "Kwabena");
});

test("the hint says where the name comes from, or what's wrong", () => {
  assert.deepEqual(nameHint("Kofi"), { text: "Born on a Friday", problem: false });
  assert.deepEqual(nameHint("Ada"), { text: "Your own name", problem: false });
  assert.deepEqual(nameHint("Ada!"), { text: "Use letters, numbers and spaces only.", problem: true });
});

test("a name must have something in it and pass the rule", () => {
  assert.equal(isValidName("  "), false);
  assert.equal(isValidName("Kwame"), true);
  assert.equal(isValidName("Ama-Serwaa"), true);
  assert.equal(isValidName("<script>"), false);
});
