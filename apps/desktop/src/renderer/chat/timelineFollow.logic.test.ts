import assert from "node:assert/strict";
import { test } from "node:test";
import { afterNewAtEnd, afterUserScroll, atEnd, FOLLOWING, isScrollKey } from "./timelineFollow.logic.ts";

test("scrolling up stops following; scrolling back to the end follows again", () => {
  const away = afterUserScroll(FOLLOWING, false);
  assert.deepEqual(away, { mode: "away", unseen: false });
  assert.equal(afterUserScroll(away, true), FOLLOWING);
});

test("something new while you're away is noted once, and kept as you keep scrolling", () => {
  const away = afterUserScroll(FOLLOWING, false);
  const noted = afterNewAtEnd(away);
  assert.deepEqual(noted, { mode: "away", unseen: true });
  assert.equal(afterNewAtEnd(noted), noted);
  assert.equal(afterUserScroll(noted, false), noted);
});

test("while following, new content changes nothing: the chat just stays at the end", () => {
  assert.equal(afterNewAtEnd(FOLLOWING), FOLLOWING);
});

test("at the end means within the slack of the bottom", () => {
  assert.equal(atEnd(1000, 560, 400), true);
  assert.equal(atEnd(1000, 500, 400), false);
});

test("the keys that scroll a focused timeline", () => {
  for (const key of ["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "]) assert.equal(isScrollKey(key), true);
  assert.equal(isScrollKey("a"), false);
});
