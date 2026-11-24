import assert from "node:assert/strict";
import { test } from "node:test";
import { nextFocusArea } from "./focusAreas.logic.ts";

const all = ["sidebar", "timeline", "composer"] as const;

test("F6 moves forward and wraps; Shift+F6 moves back", () => {
  assert.equal(nextFocusArea("sidebar", [...all], false), "timeline");
  assert.equal(nextFocusArea("composer", [...all], false), "sidebar");
  assert.equal(nextFocusArea("sidebar", [...all], true), "composer");
});

test("hidden areas are skipped, and focus outside any area starts at an end", () => {
  assert.equal(nextFocusArea("sidebar", ["sidebar", "composer"], false), "composer");
  assert.equal(nextFocusArea(null, [...all], false), "sidebar");
  assert.equal(nextFocusArea(null, [...all], true), "composer");
  assert.equal(nextFocusArea("timeline", [], false), null);
});

test("in a run, the terminal and the Diff panel follow the composer", () => {
  const run = ["sidebar", "timeline", "composer", "terminal", "panel"] as const;
  assert.equal(nextFocusArea("composer", [...run], false), "terminal");
  assert.equal(nextFocusArea("panel", [...run], false), "sidebar");
  assert.equal(nextFocusArea("composer", ["sidebar", "timeline", "composer", "panel"], false), "panel");
});
