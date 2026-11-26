import assert from "node:assert/strict";
import { test } from "node:test";
import { CATCH_UP_MS, cutAt, JUMP_CHARS, revealNext } from "./reveal.logic.ts";

test("what's arrived shows within about the catch-up time, a frame at a time", () => {
  let shown = 0;
  let elapsed = 0;
  while (shown < 300 && elapsed < 2000) {
    shown = revealNext(shown, 300, 16);
    elapsed += 16;
  }
  assert.equal(shown, 300);
  assert.ok(elapsed <= CATCH_UP_MS * 2, `took ${elapsed}ms`);
});

test("always moves, never past the end, and a small gap still goes at reading pace", () => {
  assert.equal(revealNext(10, 10, 16), 10);
  assert.ok(revealNext(0, 3, 16) >= 1);
  assert.equal(revealNext(0, 5, 1000), 5);
});

test("too far behind shows at once", () => {
  assert.equal(revealNext(0, JUMP_CHARS + 1, 16), JUMP_CHARS + 1);
});

test("words appear whole, and emoji are never split", () => {
  assert.equal(cutAt("Looking at Thursday", 13), "Looking at");
  assert.equal(cutAt("Looking at Thursday", 50), "Looking at Thursday");
  assert.equal(cutAt("Hi👋", 3), "Hi");
  assert.equal(cutAt("Supercalifragilistic", 10), "Supercalif");
});
