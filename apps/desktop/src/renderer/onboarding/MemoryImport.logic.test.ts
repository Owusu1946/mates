import assert from "node:assert/strict";
import { test } from "node:test";
import { previewMemories, promptFor, sourceOf } from "./MemoryImport.logic.ts";

test("each source's extra line is added to the shared prompt", () => {
  assert.ok(promptFor(sourceOf("claude")).endsWith("exactly as they appear in your memory."));
  assert.ok(promptFor(sourceOf("other")).endsWith("whether that is the complete set."));
});

test("links carry the prompt where the assistant accepts it", () => {
  assert.ok(sourceOf("chatgpt").url?.("hi there").includes("prompt=hi+there"));
  assert.equal(sourceOf("gemini").url?.("hi"), "https://gemini.google.com/app");
  assert.equal(sourceOf("other").url, undefined);
});

test("a pasted answer becomes one memory per line, cleaned up", () => {
  const answer = [
    "```",
    "[2026-03-02] - Lives in East Legon, Accra",
    "- Runs a small shop selling totes and shea balm",
    "2. Prefers short answers",
    "* Prefers short answers",
    "```",
    "That's the complete set of what I remember.",
  ].join("\n");
  assert.deepEqual(previewMemories(answer), ["Lives in East Legon, Accra", "Runs a small shop selling totes and shea balm", "Prefers short answers"]);
});

test("empty or tiny lines are ignored", () => {
  assert.deepEqual(previewMemories("\n\n- ok\n   \n"), []);
});
