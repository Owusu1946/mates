import assert from "node:assert/strict";
import { test } from "node:test";
import { dropPlace, MAX_PINS, parsePins, pinnedChats, reorderPins, togglePin } from "./pins.logic.ts";
import { jumpTargets } from "./Sidebar.logic.ts";

test("pinning adds to the end, pinning again takes it off, and a full shelf takes no more", () => {
  assert.deepEqual(togglePin(["a"], "b"), ["a", "b"]);
  assert.deepEqual(togglePin(["a", "b"], "a"), ["b"]);
  const full = Array.from({ length: MAX_PINS }, (_, index) => `c${index}`);
  assert.equal(togglePin(full, "new"), full);
});

test("dragging puts a pin before or after another, by which half the pointer is in", () => {
  assert.deepEqual(reorderPins(["a", "b", "c"], "c", "a", "before"), ["c", "a", "b"]);
  assert.deepEqual(reorderPins(["a", "b", "c"], "a", "b", "after"), ["b", "a", "c"]);
  assert.deepEqual(reorderPins(["a", "b"], "a", "a", "after"), ["a", "b"]);
  assert.equal(dropPlace(10, 0, 60), "before");
  assert.equal(dropPlace(40, 0, 60), "after");
});

test("pins keep shelf order and skip chats that are gone", () => {
  const chats = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(pinnedChats(chats, ["c", "gone", "a"]).map((chat) => chat.id), ["c", "a"]);
});

test("saved pins are read safely", () => {
  assert.deepEqual(parsePins('["a","b","a",3]'), ["a", "b"]);
  assert.deepEqual(parsePins("{oops"), []);
  assert.deepEqual(parsePins(null), []);
});

test("pinned chats take the first jump numbers, and nothing gets two", () => {
  const targets = jumpTargets(["b", "a", "c"], ["g"], ["g", "b"]);
  assert.deepEqual(targets.map((target) => target.id), ["g", "b", "a", "c"]);
});
