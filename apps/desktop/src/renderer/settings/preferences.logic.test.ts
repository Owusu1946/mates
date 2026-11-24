import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PREFERENCES, parsePreferences, shortcutLabel } from "./preferences.logic.ts";

test("saved preferences are read back, field by field, and anything odd keeps its default", () => {
  const saved = JSON.stringify({ desktop: { openAtLogin: true, keepRunning: "no" }, privacy: { snapshot: true }, made: { up: true } });
  const prefs = parsePreferences(saved);
  assert.equal(prefs.desktop.openAtLogin, true);
  assert.equal(prefs.desktop.keepRunning, true, "a wrong type keeps the default");
  assert.equal(prefs.privacy.snapshot, true);
  assert.deepEqual(prefs.voice, DEFAULT_PREFERENCES.voice);
  assert.deepEqual(parsePreferences("not json"), DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences(null), DEFAULT_PREFERENCES);
});

test("SnapShot is off until you turn it on", () => {
  assert.equal(DEFAULT_PREFERENCES.privacy.snapshot, false);
});

test("shortcuts read in each system's style", () => {
  assert.equal(shortcutLabel("Control+Shift+Space", "win32"), "Ctrl+Shift+Space");
  assert.equal(shortcutLabel("Alt+Space", "darwin"), "⌥Space");
});
