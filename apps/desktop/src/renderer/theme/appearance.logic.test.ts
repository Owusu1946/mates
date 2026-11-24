import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_APPEARANCE, isDark, parseAppearance } from "./appearance.logic.ts";

test("Nightly, following the system, is the default", () => {
  assert.deepEqual(DEFAULT_APPEARANCE, { scheme: "system", theme: "nightly" });
  assert.deepEqual(parseAppearance(null), DEFAULT_APPEARANCE);
});

test("System follows the computer; Light and Dark don't", () => {
  assert.equal(isDark("system", true), true);
  assert.equal(isDark("system", false), false);
  assert.equal(isDark("dark", false), true);
  assert.equal(isDark("light", true), false);
});

test("a saved appearance is read back, and anything odd falls back", () => {
  assert.deepEqual(parseAppearance('{"scheme":"dark","theme":"harmattan"}'), { scheme: "dark", theme: "harmattan" });
  assert.deepEqual(parseAppearance('{"scheme":"sepia","theme":"neon"}'), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance("not json"), DEFAULT_APPEARANCE);
});
