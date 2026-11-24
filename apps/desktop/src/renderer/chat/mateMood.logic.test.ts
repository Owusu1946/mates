import assert from "node:assert/strict";
import { test } from "node:test";
import type { Reply } from "./chatFlow.logic.ts";
import { finishedReplying, moodOf } from "./mateMood.logic.ts";

const reply = (mateId: string, phase: Reply["phase"]): Reply => ({ chatId: `chat-${mateId}`, mateId, phase, full: "Done.", shown: 0 });

test("replying outranks listening, which outranks the happy beat", () => {
  const none = new Set<string>();
  assert.equal(moodOf("esi", { replies: { a: reply("esi", "thinking") }, typingTo: "esi", happy: none }), "thinking");
  assert.equal(moodOf("esi", { replies: { a: reply("esi", "streaming") }, typingTo: null, happy: none }), "working");
  assert.equal(moodOf("esi", { replies: {}, typingTo: "esi", happy: new Set(["esi"]) }), "listening");
  assert.equal(moodOf("esi", { replies: {}, typingTo: null, happy: new Set(["esi"]) }), "happy");
  assert.equal(moodOf("yaw", { replies: { a: reply("esi", "thinking") }, typingTo: "esi", happy: none }), null);
});

test("a mate has finished when its reply is gone", () => {
  assert.deepEqual(finishedReplying({ a: reply("esi", "streaming"), b: reply("yaw", "thinking") }, { b: reply("yaw", "streaming") }), ["esi"]);
  assert.deepEqual(finishedReplying({}, {}), []);
});
