import assert from "node:assert/strict";
import { test } from "node:test";
import { frameIntervalFor, isLowEnd, shouldAnimate } from "./mascotMotion.logic.ts";

const base = { state: "idle", size: 32, onScreen: true, pageVisible: true, reducedMotion: false, beat: false };

test("weak machines are the ones with few cores or little memory", () => {
  assert.equal(isLowEnd({ cores: 4, memoryGb: 8 }), true);
  assert.equal(isLowEnd({ cores: 8, memoryGb: 4 }), true);
  assert.equal(isLowEnd({ cores: 8, memoryGb: 16 }), false);
  assert.equal(isLowEnd({}), false, "unknown isn't assumed weak");
});

test("list faces draw fewer frames than big ones, and fewer still on weak machines", () => {
  assert.equal(frameIntervalFor(32, false), 33);
  assert.equal(frameIntervalFor(32, true), 42);
  assert.equal(frameIntervalFor(96, false), 17);
  assert.equal(frameIntervalFor(96, true), 33);
});

test("a face moves only on screen, in a visible window, with motion allowed", () => {
  assert.equal(shouldAnimate({ ...base, state: "thinking" }), true);
  assert.equal(shouldAnimate({ ...base, state: "thinking", onScreen: false }), false);
  assert.equal(shouldAnimate({ ...base, state: "thinking", pageVisible: false }), false);
  assert.equal(shouldAnimate({ ...base, state: "thinking", reducedMotion: true }), false);
  assert.equal(shouldAnimate({ ...base, state: "thinking", still: true }), false);
});

test("an idle list face holds still after its beat; a big one keeps breathing", () => {
  assert.equal(shouldAnimate(base), false);
  assert.equal(shouldAnimate({ ...base, beat: true }), true, "a new state plays for a beat");
  assert.equal(shouldAnimate({ ...base, size: 96 }), true);
  assert.equal(shouldAnimate({ ...base, state: "listening" }), true, "listening while you type keeps moving");
});
