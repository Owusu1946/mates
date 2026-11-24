import assert from "node:assert/strict";
import { test } from "node:test";
import { nextMode, OPEN_WIDTH, parseNotch, shapeSize } from "./notch.logic.ts";

test("hovering peeks, clicking or the shortcut opens, and it closes only when asked", () => {
  assert.equal(nextMode("rest", "hoverIn"), "peek");
  assert.equal(nextMode("peek", "hoverOut"), "rest");
  assert.equal(nextMode("rest", "click"), "open");
  assert.equal(nextMode("peek", "toggle"), "open");
  assert.equal(nextMode("open", "hoverOut"), "open", "moving the pointer away doesn't close it");
  assert.equal(nextMode("open", "click"), "open");
  assert.equal(nextMode("open", "toggle"), "rest");
  assert.equal(nextMode("open", "close"), "rest");
});

test("the shape grows from the camera housing to the bar, as tall as its content", () => {
  const notch = { width: 182, height: 37 };
  assert.deepEqual(shapeSize("rest", notch, 0), { width: 250, height: 37, radius: 12 });
  assert.deepEqual(shapeSize("peek", notch, 0), { width: 406, height: 43, radius: 16 });
  assert.deepEqual(shapeSize("open", notch, 120.4), { width: OPEN_WIDTH, height: 158, radius: 26 });
});

test("the notch comes from the page's address, with sane fallbacks", () => {
  assert.deepEqual(parseNotch("?w=190&h=38"), { width: 190, height: 38 });
  assert.deepEqual(parseNotch("?w=9000&h=x"), { width: 182, height: 32 });
  assert.deepEqual(parseNotch(""), { width: 182, height: 32 });
});
