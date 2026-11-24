import assert from "node:assert/strict";
import { test } from "node:test";
import { clampSize, drawerMaxHeight, PANEL, panelMaxWidth, parseSavedSize } from "./panelSize.logic.ts";

test("the panel takes at most 70% of the window and leaves the chat 360px", () => {
  assert.equal(panelMaxWidth(1600), 1120);
  assert.equal(panelMaxWidth(1600, 1000), 640);
  // Never below its own minimum, even in a narrow window.
  assert.equal(panelMaxWidth(500, 500), PANEL.minWidth);
});

test("the drawer takes at most three quarters of the column and leaves the composer visible", () => {
  assert.equal(drawerMaxHeight(800), 600);
  assert.equal(drawerMaxHeight(480), 320);
  assert.equal(drawerMaxHeight(100), 180);
});

test("sizes are clamped, and anything unreadable falls back", () => {
  assert.equal(clampSize(900, 360, 700, 540), 700);
  assert.equal(clampSize(100.4, 360, 700, 540), 360);
  assert.equal(clampSize(Number.NaN, 360, 700, 540), 540);
  assert.equal(parseSavedSize("512"), 512);
  assert.equal(parseSavedSize("wide"), null);
  assert.equal(parseSavedSize(null), null);
});
