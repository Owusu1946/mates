import assert from "node:assert/strict";
import { test } from "node:test";
import { jumpIndexForKey, jumpNumber, jumpTargets, sameSelection } from "./Sidebar.logic.ts";

test("mates come before groups, and only nine rows get a number", () => {
  const mates = ["m1", "m2", "m3", "m4", "m5", "m6", "m7"];
  const targets = jumpTargets(mates, ["g1", "g2", "g3"]);
  assert.equal(targets.length, 9);
  assert.deepEqual(targets[0], { kind: "chat", id: "m1" });
  assert.deepEqual(targets[7], { kind: "chat", id: "g1" });
  assert.equal(jumpNumber(targets, { kind: "chat", id: "g3" }), null);
  assert.equal(jumpNumber(targets, { kind: "chat", id: "m2" }), 2);
  assert.equal(jumpNumber(targets, { kind: "place", id: "m2" }), null);
});

test("only the digits 1 to 9 jump", () => {
  assert.equal(jumpIndexForKey("1"), 0);
  assert.equal(jumpIndexForKey("9"), 8);
  assert.equal(jumpIndexForKey("0"), null);
  assert.equal(jumpIndexForKey("k"), null);
});

test("a selection is the same when kind and id match", () => {
  assert.equal(sameSelection({ kind: "chat", id: "a" }, { kind: "chat", id: "a" }), true);
  assert.equal(sameSelection({ kind: "chat", id: "a" }, { kind: "repo", id: "a" }), false);
});
