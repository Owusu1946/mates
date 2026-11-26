import assert from "node:assert/strict";
import { test } from "node:test";
import { splitBlocks } from "./markdownBlocks.logic.ts";

test("blocks end at blank lines, however many", () => {
  assert.deepEqual(splitBlocks("Hello\nthere\n\n\n- one\n- two\n\nBye"), ["Hello\nthere", "- one\n- two", "Bye"]);
  assert.deepEqual(splitBlocks(""), []);
  assert.deepEqual(splitBlocks("\n\nOnly\n\n"), ["Only"]);
});

test("a code fence stays one block, blank lines and all", () => {
  const text = "Run this:\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nDone";
  assert.deepEqual(splitBlocks(text), ["Run this:", "```ts\nconst a = 1;\n\nconst b = 2;\n```", "Done"]);
});

test("a fence still being written stays open to the end", () => {
  assert.deepEqual(splitBlocks("Here:\n\n```\nline 1\n\nline 2"), ["Here:", "```\nline 1\n\nline 2"]);
});

test("tildes close tildes, and a shorter backtick run doesn't close a longer fence", () => {
  assert.deepEqual(splitBlocks("~~~\na\n\nb\n~~~\n\nc"), ["~~~\na\n\nb\n~~~", "c"]);
  assert.deepEqual(splitBlocks("````\n```\n\nstill code\n````\n\nafter"), ["````\n```\n\nstill code\n````", "after"]);
});

test("Windows line endings split the same", () => {
  assert.deepEqual(splitBlocks("a\r\n\r\nb"), ["a", "b"]);
});
