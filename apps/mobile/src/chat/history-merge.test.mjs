import assert from "node:assert/strict";
import { test } from "node:test";
import { canonical, planMerge, rootPage, sameMessage } from "./history-merge.ts";

const msg = (id, text = id, extra = {}) => ({ id, role: "assistant", content: [{ type: "text", text }], createdAt: new Date(Date.UTC(2026, 10, 21, 10, 0, Number(id.replace(/\D/g, "")) || 0)), ...extra });
const item = (id, parentId, text) => ({ message: msg(id, text), parentId });
const repo = (items, headId) => ({ headId: headId ?? items.at(-1)?.message.id ?? null, messages: items });
const realOf = (items) => new Map(items.map((i) => [i.message.id, i.parentId]));
const parentOf = (plan, id) => plan.messages.find((i) => i.message.id === id)?.parentId;

test("two copies of one message compare equal, whatever their key order or date type", () => {
  const a = { id: "m1", content: [{ type: "text", text: "hi" }], createdAt: new Date("2026-11-21T10:00:00Z") };
  const b = { createdAt: "2026-11-21T10:00:00.000Z", content: [{ text: "hi", type: "text" }], id: "m1" };
  assert.ok(sameMessage(a, b));
  assert.equal(canonical({ b: 1, a: undefined }), '{"b":1}');
});

test("nothing changed: nothing to import, so the chat isn't touched", () => {
  const items = [item("m1", null), item("m2", "m1"), item("m3", "m2")];
  const copy = structuredClone(items).map((i) => ({ ...i, message: { ...i.message, createdAt: new Date(i.message.createdAt) } }));
  assert.equal(planMerge(repo(items), copy, { realParents: realOf(items) }), null);
});

test("the import is the whole thread, with only the changed and new messages swapped in", () => {
  const current = repo([item("m1", null), item("m2", "m1", "thinking…")]);
  const incoming = [item("m1", null), item("m2", "m1", "Here's the plan"), item("m3", "m2")];
  const plan = planMerge(current, incoming, { realParents: realOf(incoming), serverHead: "m3" });
  assert.deepEqual(plan.changed, ["m2", "m3"]);
  assert.deepEqual(plan.messages.map((i) => i.message.id), ["m1", "m2", "m3"]);
  assert.equal(plan.headId, "m3");
  // The unchanged message is the very same object, so its row doesn't redraw.
  assert.equal(plan.messages[0], current.messages[0]);
  assert.equal(plan.messages[1].message.content[0].text, "Here's the plan");
});

test("the head never jumps away from a branch the user is on", () => {
  // The user regenerated m3 as r3 and is reading r3; the server's newest is still on the old branch.
  const current = repo([item("m1", null), item("m2", "m1"), item("m3", "m2"), item("r3", "m2")], "r3");
  const incoming = [item("m3", "m2", "edited"), item("m4", "m3")];
  const plan = planMerge(current, incoming, { realParents: realOf(incoming), serverHead: "m4" });
  assert.equal(plan.headId, "r3");
  assert.deepEqual(plan.changed, ["m3", "m4"]);
  assert.equal(plan.messages.length, 5);
});

test("a tail refresh adds new replies under messages already on screen", () => {
  const current = repo([item("m1", null), item("m2", "m1"), item("m3", "m2")]);
  // The server's last few: its top (m2) has a parent the page doesn't include.
  const tail = [item("m2", "m1"), item("m3", "m2"), item("m4", "m3"), item("m5", "m4")];
  const plan = planMerge(current, tail, { realParents: realOf(tail), serverHead: "m5" });
  assert.deepEqual(plan.changed, ["m4", "m5"]);
  assert.equal(parentOf(plan, "m4"), "m3");
  assert.equal(parentOf(plan, "m5"), "m4");
  assert.equal(plan.headId, "m5");
  assert.ok(plan.connected);
});

test("a refresh that fell too far behind says it doesn't join on", () => {
  const current = repo([item("m1", null), item("m2", "m1")]);
  const tail = [item("m8", "m7"), item("m9", "m8")];
  const plan = planMerge(current, tail, { realParents: realOf(tail), serverHead: "m9" });
  assert.equal(plan.connected, false);
  // Kept off the branch on screen until the gap is filled.
  assert.equal(plan.headId, "m2");
});

test("loading earlier history links the old top of the chat under the page above it, without moving the head", () => {
  // On screen: m51…m53, shown with m51 at the top (its parent m50 wasn't loaded).
  const current = repo([item("m51", null), item("m52", "m51"), item("m53", "m52")]);
  const realParents = new Map([["m51", "m50"], ["m52", "m51"], ["m53", "m52"]]);
  const older = [item("m49", "m48"), item("m50", "m49")];
  for (const i of older) realParents.set(i.message.id, i.parentId);
  const plan = planMerge(current, older, { realParents, keepHead: true });
  assert.deepEqual(plan.changed, ["m49", "m50", "m51"]);
  assert.equal(parentOf(plan, "m49"), null);
  assert.equal(parentOf(plan, "m50"), "m49");
  assert.equal(parentOf(plan, "m51"), "m50");
  assert.equal(plan.headId, "m53");
  // The relinked message is the same message object, so its row isn't rebuilt.
  assert.equal(plan.messages[0].message, current.messages[0].message);
  assert.equal(plan.messages[1], current.messages[1]);
});

test("arrives in any order: a reply listed before its question still joins under it", () => {
  const current = repo([item("m1", null)]);
  const incoming = [item("m3", "m2"), item("m2", "m1")];
  const plan = planMerge(current, incoming, { realParents: realOf(incoming), serverHead: "m3" });
  assert.equal(parentOf(plan, "m2"), "m1");
  assert.equal(parentOf(plan, "m3"), "m2");
  assert.equal(plan.headId, "m3");
});

test("an empty chat takes the page as it comes", () => {
  const page = rootPage([item("m10", "m9"), item("m11", "m10")]);
  assert.equal(page[0].parentId, null);
  const plan = planMerge(repo([]), page, { realParents: new Map([["m10", "m9"], ["m11", "m10"]]), serverHead: "m11" });
  assert.equal(plan.headId, "m11");
  assert.deepEqual(plan.messages.map((i) => [i.message.id, i.parentId]), [["m10", null], ["m11", "m10"]]);
});

test("a cycle in bad data is left out rather than looping", () => {
  const incoming = [item("a", "b"), item("b", "a")];
  const plan = planMerge(repo([item("m1", null)]), incoming, { realParents: realOf(incoming) });
  assert.equal(plan, null);
});
