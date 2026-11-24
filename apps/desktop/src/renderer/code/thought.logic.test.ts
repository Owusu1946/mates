import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineParts, revealWords, splitThought, thoughtBlocks, thoughtLine, wordCount } from "./thought.logic.ts";

const thought = "**Understanding the flow**\n\nThe sheet never closes. That means the redirect is wrong.\n\nI'll check:\n1. How `sign-in.tsx` starts it.\n2. The root layout.";

test("a thought's heading names it; without one, its first sentence does", () => {
  assert.deepEqual(splitThought(thought).heading, "Understanding the flow");
  assert.ok(splitThought(thought).body.startsWith("The sheet"));
  assert.equal(thoughtLine(thought), "Understanding the flow");
  assert.equal(thoughtLine("The test passes. Now the `typecheck` too."), "The test passes.");
  assert.equal(thoughtLine("I need to check:\n- one"), "I need to check:");
});

test("the body becomes paragraphs and lists", () => {
  const blocks = thoughtBlocks(splitThought(thought).body);
  assert.deepEqual(blocks, [
    { type: "p", text: "The sheet never closes. That means the redirect is wrong." },
    { type: "p", text: "I'll check:" },
    { type: "ol", items: ["How `sign-in.tsx` starts it.", "The root layout."] },
  ]);
  assert.deepEqual(thoughtBlocks("Plan:\n- a\n- b"), [
    { type: "p", text: "Plan:" },
    { type: "ul", items: ["a", "b"] },
  ]);
});

test("code and bold are picked out, and an unclosed marker stays as text", () => {
  assert.deepEqual(inlineParts("Call `fit()` **now** please"), [{ text: "Call " }, { text: "fit()", code: true }, { text: " " }, { text: "now", bold: true }, { text: " please" }]);
  assert.deepEqual(inlineParts("half `open"), [{ text: "half `open" }]);
});

test("streaming reveals whole words and keeps line breaks", () => {
  assert.equal(wordCount("one two\n\nthree"), 3);
  assert.equal(revealWords("one two\n\nthree", 2), "one two");
  assert.equal(revealWords("one two\n\nthree", 3), "one two\n\nthree");
  assert.equal(revealWords("one", 0), "");
});
