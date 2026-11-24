import assert from "node:assert/strict";
import { test } from "node:test";
import { SUMMON_MAX_HEIGHT, SUMMON_MIN_HEIGHT, parseHandoff, shortcutLabel, summonBounds, summonHeight, summonOptions, summonShortcuts } from "./SummonWindow.logic.ts";

test("the bar opens centred, a fifth of the way down the screen the pointer is on", () => {
  assert.deepEqual(summonBounds({ x: 0, y: 0, width: 1920, height: 1040 }, 96), { x: 620, y: 229, width: 680, height: 96 });
  // A second screen to the right keeps its own offset.
  assert.equal(summonBounds({ x: 1920, y: 0, width: 1280, height: 800 }, 96).x, 1920 + 300);
  // A narrow screen gets a narrower bar.
  assert.equal(summonBounds({ x: 0, y: 0, width: 500, height: 800 }, 96).width, 468);
});

test("the page's height is kept within the window's limits", () => {
  assert.equal(summonHeight(180.2), 181);
  assert.equal(summonHeight(10), SUMMON_MIN_HEIGHT);
  assert.equal(summonHeight(5000), SUMMON_MAX_HEIGHT);
  assert.equal(summonHeight("tall"), SUMMON_MIN_HEIGHT);
});

test("Alt+Space first, with a fallback, and labels in each system's style", () => {
  assert.deepEqual(summonShortcuts("win32"), ["Alt+Space", "Control+Shift+Space"]);
  assert.deepEqual(summonShortcuts("darwin"), ["Alt+Space", "Command+Shift+Space"]);
  assert.equal(shortcutLabel("Alt+Space", "darwin"), "⌥Space");
  assert.equal(shortcutLabel("Command+Shift+Space", "darwin"), "⌘⇧Space");
  assert.equal(shortcutLabel("Control+Shift+Space", "linux"), "Ctrl+Shift+Space");
});

test("the window floats: no frame, see-through, out of the taskbar, sandboxed", () => {
  const options = summonOptions("/preload.cjs");
  assert.equal(options.frame, false);
  assert.equal(options.transparent, true);
  assert.equal(options.skipTaskbar, true);
  assert.equal(options.alwaysOnTop, true);
  assert.equal(options.webPreferences?.sandbox, true);
  assert.equal(options.webPreferences?.nodeIntegration, false);
});

test("a hand-off is checked before the app acts on it", () => {
  assert.deepEqual(parseHandoff({ mateId: "esi", question: "Hostels?", answer: "Found 3." }), { mateId: "esi", question: "Hostels?", answer: "Found 3." });
  assert.equal(parseHandoff({ mateId: "../x", question: "a", answer: "" }), null);
  assert.equal(parseHandoff({ mateId: "esi", question: "  ", answer: "" }), null);
  assert.equal(parseHandoff("esi"), null);
  assert.equal(parseHandoff(null), null);
});
