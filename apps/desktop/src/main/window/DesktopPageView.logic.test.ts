import assert from "node:assert/strict";
import { test } from "node:test";
import { pageAction, pageBounds, pageUrl } from "./DesktopPageView.logic.ts";

test("only web pages open in the panel", () => {
  assert.equal(pageUrl("https://qncnews.com/ghana/bog"), "https://qncnews.com/ghana/bog");
  assert.equal(pageUrl("http://example.com"), "http://example.com/");
  assert.equal(pageUrl("file:///C:/Windows/win.ini"), null);
  assert.equal(pageUrl("javascript:alert(1)"), null);
  assert.equal(pageUrl("mates://app/"), null);
  assert.equal(pageUrl("https://user:pass@example.com"), null);
  assert.equal(pageUrl("not a url"), null);
  assert.equal(pageUrl(42), null);
});

test("the panel's place is whole pixels, never negative", () => {
  assert.deepEqual(pageBounds({ x: 640.4, y: 104.6, width: 480.5, height: -3 }), { x: 640, y: 105, width: 481, height: 0 });
  assert.deepEqual(pageBounds(null), { x: 0, y: 0, width: 0, height: 0 });
  assert.deepEqual(pageBounds({ x: "1", y: Number.NaN }), { x: 0, y: 0, width: 0, height: 0 });
});

test("only the toolbar's actions are taken", () => {
  assert.equal(pageAction("back"), "back");
  assert.equal(pageAction("reload"), "reload");
  assert.equal(pageAction("devtools"), null);
});
