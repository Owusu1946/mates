import assert from "node:assert/strict";
import { test } from "node:test";
import { liveChatOf } from "./liveChat.logic.ts";

const text = (value: string) => ({ type: "text", text: value });
const card = (kind: string, phase: string, label: string) => ({ type: "tool-call", toolCallId: label, toolName: "cooper_workflow", result: { kind, phase, label } });

test("thinking until words or a step come", () => {
  assert.deepEqual(liveChatOf([], "queued", false), { phase: "thinking" });
  assert.deepEqual(liveChatOf([text("  ")], "running", false), { phase: "thinking" });
});

test("working while it writes, named by the step it's on", () => {
  assert.deepEqual(liveChatOf([text("Looking")], "running", false), { phase: "working" });
  assert.deepEqual(liveChatOf([card("step", "done", "Read your calendar"), card("step", "running", "Finding a dentist slot")], "running", false), { phase: "working", step: "Finding a dentist slot" });
  // Speaker labels in a group aren't steps.
  assert.deepEqual(liveChatOf([card("speaker", "running", "Esi")], "running", false), { phase: "thinking" });
});

test("waiting when the run stopped for you; nothing once it finished or failed", () => {
  assert.deepEqual(liveChatOf([text("Ready to pay"), card("approval", "waiting", "Pay DStv GH¢180")], "waiting", true), { phase: "waiting", step: "Pay DStv GH¢180" });
  assert.deepEqual(liveChatOf([], "waiting", true), { phase: "waiting" });
  assert.equal(liveChatOf([text("Done")], "completed", true), null);
  assert.equal(liveChatOf([text("Oops")], "failed", true), null);
});
