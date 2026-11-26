import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyThread, withoutMessages, withReply, withSent, type Thread } from "./threadEdit.logic.ts";

const text = (value: string) => ({ type: "text", text: value });
const sent = (thread: Thread, id: string, parentId: string | null) => withSent(thread, { id, text: id, createdAt: "2026-11-26T10:00:00Z" }, parentId);

test("your message shows at once under the last one, and sending it twice adds it once", () => {
  const thread = sent(emptyThread(), "u1", null);
  assert.equal(thread.headId, "u1");
  assert.equal(sent(thread, "u1", null), thread);
});

test("a reply is added under its question while live, then written in place until it settles", () => {
  let thread = sent(emptyThread(), "u1", null);
  thread = withReply(thread, { id: "a1", parentId: "u1", content: [text("Look")], live: true });
  assert.equal(thread.headId, "a1");
  assert.deepEqual(thread.live, ["a1"]);
  assert.equal(thread.items.at(-1)!.message.status!.type, "running");
  thread = withReply(thread, { id: "a1", parentId: "u1", content: [text("Looking at Thursday")], live: true });
  assert.equal(thread.items.length, 2);
  assert.deepEqual(thread.items[1]!.message.content, [text("Looking at Thursday")]);
  thread = withReply(thread, { id: "a1", parentId: "u1", content: [], live: false });
  assert.deepEqual(thread.live, []);
  // A settling event without content keeps what was said.
  assert.deepEqual(thread.items[1]!.message.content, [text("Looking at Thursday")]);
  assert.deepEqual(thread.items[1]!.message.status, { type: "complete", reason: "stop" });
});

test("a stopped reply settles as stopped", () => {
  const thread = withReply(sent(emptyThread(), "u1", null), { id: "a1", parentId: "u1", content: [text("Half")], live: false, status: { type: "incomplete", reason: "cancelled" } });
  assert.deepEqual(thread.items[1]!.message.status, { type: "incomplete", reason: "cancelled" });
});

test("a message that didn't send leaves, and the chat reads down to what was before it", () => {
  let thread = sent(emptyThread(), "u1", null);
  thread = withReply(thread, { id: "a1", parentId: "u1", content: [text("Hi")], live: false });
  thread = sent(thread, "u2", "a1");
  thread = withReply(thread, { id: "a2", parentId: "u2", content: [], live: true });
  const back = withoutMessages(thread, ["u2", "a2"]);
  assert.deepEqual(back.items.map((item) => item.message.id), ["u1", "a1"]);
  assert.equal(back.headId, "a1");
  assert.deepEqual(back.live, []);
});
