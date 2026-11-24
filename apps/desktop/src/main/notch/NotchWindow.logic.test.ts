import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_NOTCH_WIDTH, detectNotch, notchCanvasBounds, notchOptions } from "./NotchWindow.logic.ts";

const notched = { internal: true, bounds: { x: 0, y: 0, width: 1512, height: 982 }, workArea: { x: 0, y: 37, width: 1512, height: 945 } };
const plain = { internal: true, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 24, width: 1440, height: 876 } };
const external = { internal: false, bounds: { x: 1512, y: -200, width: 2560, height: 1440 }, workArea: { x: 1512, y: -163, width: 2560, height: 1403 } };

test("a notch is the built-in screen of a Mac with the taller menu bar", () => {
  assert.deepEqual(detectNotch(notched, "darwin"), { width: DEFAULT_NOTCH_WIDTH, height: 37 });
  assert.equal(detectNotch(plain, "darwin"), null, "a Mac without a notch keeps the pill");
  assert.equal(detectNotch(external, "darwin"), null, "an external screen has no notch");
  assert.equal(detectNotch(notched, "win32"), null);
});

test("the width can be tuned on real hardware, within sane limits, and previewed anywhere", () => {
  assert.equal(detectNotch(notched, "darwin", { width: "190" })?.width, 190);
  assert.equal(detectNotch(notched, "darwin", { width: "9000" })?.width, DEFAULT_NOTCH_WIDTH);
  assert.deepEqual(detectNotch(plain, "win32", { force: true }), { width: DEFAULT_NOTCH_WIDTH, height: 24 });
});

test("the canvas sits flush with the top of its screen, centred on the notch", () => {
  assert.deepEqual(notchCanvasBounds(notched), { x: 396, y: 0, width: 720, height: 560 });
  assert.equal(notchCanvasBounds(external).y, -200, "a screen above the main one keeps its own top");
});

test("the window floats as a non-activating panel on a Mac, and only there", () => {
  assert.equal(notchOptions("/p.cjs", "darwin").type, "panel");
  assert.equal(notchOptions("/p.cjs", "win32").type, undefined);
  assert.equal(notchOptions("/p.cjs", "darwin").transparent, true);
  assert.equal(notchOptions("/p.cjs", "darwin").webPreferences?.sandbox, true);
});
