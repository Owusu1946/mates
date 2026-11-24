import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_DESKTOP_PREFS, parseDesktopPrefs, shortcutChoices } from "./DesktopPrefs.logic.ts";

test("preferences from the page are checked before they're applied", () => {
  assert.deepEqual(parseDesktopPrefs({ openAtLogin: true, keepRunning: false, summonShortcut: "Control+Alt+M", notch: false }), { openAtLogin: true, keepRunning: false, summonShortcut: "Control+Alt+M", notch: false });
  assert.equal(parseDesktopPrefs({ openAtLogin: "yes", keepRunning: true, summonShortcut: "Alt+Space", notch: true }), null);
  assert.equal(parseDesktopPrefs(null), null);
  assert.equal(parseDesktopPrefs({ ...DEFAULT_DESKTOP_PREFS, summonShortcut: "Control+Alt+Delete" })?.summonShortcut, "Alt+Space", "an unknown shortcut falls back");
});

test("shortcut choices suit the system", () => {
  assert.deepEqual(shortcutChoices("darwin"), ["Alt+Space", "Command+Shift+Space"]);
  assert.deepEqual(shortcutChoices("win32"), ["Alt+Space", "Control+Shift+Space", "Control+Alt+M"]);
});
