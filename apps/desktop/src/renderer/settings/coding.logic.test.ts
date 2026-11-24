import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CODING, parseCoding, preferenceFromOnboarding, showsCoding } from "./coding.logic.ts";

test("Always and Never are what you said; Automatic waits until you start coding", () => {
  const none = { engaged: false, hasProjects: false };
  assert.equal(showsCoding("on", none), true);
  assert.equal(showsCoding("off", { engaged: true, hasProjects: true }), false);
  assert.equal(showsCoding("auto", none), false);
  assert.equal(showsCoding("auto", { engaged: true, hasProjects: false }), true, "a mate coded for you");
  assert.equal(showsCoding("auto", { engaged: false, hasProjects: true }), true, "you connected a project");
});

test("onboarding's answer sets the preference, and a no can still turn on later", () => {
  assert.equal(preferenceFromOnboarding(true), "on");
  assert.equal(preferenceFromOnboarding(false), "auto");
});

test("a saved preference is read back, and anything odd falls back to Automatic", () => {
  assert.deepEqual(parseCoding('{"preference":"off","engaged":true}'), { preference: "off", engaged: true });
  assert.deepEqual(parseCoding('{"preference":"sometimes"}'), DEFAULT_CODING);
  assert.deepEqual(parseCoding("nope"), DEFAULT_CODING);
  assert.deepEqual(parseCoding(null), DEFAULT_CODING);
});
