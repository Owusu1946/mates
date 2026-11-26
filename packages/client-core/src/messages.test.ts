import assert from "node:assert/strict";
import { test } from "node:test";
import { branchTo, cleanMessage, headOf, leafUnder, siblingsOf, textOf } from "./messages.ts";

const item = (id, parentId, role = "assistant", text = id) => ({ message: { id, role, createdAt: "2026-11-26T10:00:00.000Z", content: [{ type: "text", text }] }, parentId });

test("a stored message is cleaned, never thrown out for a bad part", () => {
  const cleaned = cleanMessage({ id: "m1", role: "assistant", createdAt: "2026-11-26T10:00:00.000Z", content: [{ type: "text", text: "Hi" }, null, { text: "no type" }, { type: "tool-call", toolCallId: "t", toolName: "cooper_workflow" }] });
  assert.deepEqual(cleaned.message.content.map((part) => part.type), ["text", "tool-call"]);
  assert.equal(cleaned.live, false);
});

test("a reply the server is still writing is live", () => {
  assert.equal(cleanMessage({ id: "m1", role: "assistant", status: { type: "running" }, content: [] }).live, true);
  assert.equal(cleanMessage({ id: "m1", role: "user", status: { type: "running" }, content: [] }).live, false);
});

test("rows without an id or a known role aren't messages, and missing fields get defaults", () => {
  assert.equal(cleanMessage(null), null);
  assert.equal(cleanMessage({ role: "user" }), null);
  assert.equal(cleanMessage({ id: "x", role: "robot" }), null);
  const bare = cleanMessage({ id: "x", role: "user" });
  assert.deepEqual(bare.message.content, []);
  assert.equal(bare.message.createdAt, new Date(0).toISOString());
});

test("text joins a message's text parts, skipping cards", () => {
  assert.equal(textOf({ content: [{ type: "text", text: "Hello " }, { type: "tool-call", toolCallId: "t", toolName: "x" }, { type: "text", text: "there" }] }), "Hello there");
});

test("the chat reads from the top down to its newest leaf, whatever order the rows came in", () => {
  const items = [item("m1", null, "user"), item("m3", "m2"), item("m2", "m1")];
  assert.equal(headOf(items), "m3");
  assert.deepEqual(branchTo(items, "m3").map((i) => i.message.id), ["m1", "m2", "m3"]);
});

test("a regenerated reply is a version beside the first, and switching to one reads on to its end", () => {
  // m1 (you) → r1 → m3 (you) → r3 ; and r2, a second answer to m1
  const items = [item("m1", null, "user"), item("r1", "m1"), item("m3", "r1", "user"), item("r3", "m3"), item("r2", "m1")];
  assert.deepEqual(siblingsOf(items, "r1"), ["r1", "r2"]);
  assert.equal(leafUnder(items, "r1"), "r3");
  assert.equal(leafUnder(items, "r2"), "r2");
  assert.deepEqual(branchTo(items, "r2").map((i) => i.message.id), ["m1", "r2"]);
});

test("a cycle in bad data ends the walk instead of looping", () => {
  const items = [item("a", "b"), item("b", "a")];
  assert.equal(branchTo(items, "a").length, 2);
  assert.equal(leafUnder(items, "a"), "a");
});
