import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoredItem, StoredMessage } from "@muse-clone/client-core";
import { dayLabel, toRows } from "./messages.logic.ts";

const now = new Date("2026-11-26T15:00:00");
const message = (id: string, role: StoredMessage["role"], content: StoredMessage["content"], createdAt = "2026-11-26T10:00:00"): StoredMessage => ({ id, role, createdAt, content });
const text = (value: string) => ({ type: "text", text: value });
const card = (result: Record<string, unknown>) => ({ type: "tool-call", toolCallId: `t${Math.random()}`, toolName: "cooper_workflow", result });
const speaker = (id: string) => card({ kind: "speaker", phase: "done", label: id, speaker: { id, name: id } });
const at = (items: StoredItem[]) => items.at(-1)!.message.id;
const options = { defaultAuthor: "kofi", live: new Set<string>(), now };

test("you are me, the chat's mate answers, and the first message of each day has its divider", () => {
  const items: StoredItem[] = [
    { message: message("u1", "user", [text("Hi")], "2026-11-25T09:00:00"), parentId: null },
    { message: message("a1", "assistant", [text("Hello!")], "2026-11-25T09:00:05"), parentId: "u1" },
    { message: message("u2", "user", [text("Plan my week")]), parentId: "a1" },
  ];
  const rows = toRows(items, at(items), options);
  assert.deepEqual(rows.map((row) => [row.id, row.author, row.text, row.day]), [
    ["u1", "me", "Hi", "Yesterday"],
    ["a1", "kofi", "Hello!", undefined],
    ["u2", "me", "Plan my week", "Today"],
  ]);
});

test("in a group, each speaker's turn in one reply is its own row", () => {
  const items: StoredItem[] = [
    { message: message("u1", "user", [text("Kumasi or Accra?")]), parentId: null },
    { message: message("a1", "assistant", [speaker("esi"), text("Accra has more options."), speaker("akua"), text("Kumasi saves about GH¢400.")]), parentId: "u1" },
  ];
  const rows = toRows(items, at(items), options);
  assert.deepEqual(rows.slice(1).map((row) => [row.id, row.sourceId, row.author, row.text]), [
    ["a1", "a1", "esi", "Accra has more options."],
    ["a1:1", "a1", "akua", "Kumasi saves about GH¢400."],
  ]);
});

test("a live reply shows what the mate is doing, even before it has words", () => {
  const items: StoredItem[] = [
    { message: message("u1", "user", [text("Find a dentist")]), parentId: null },
    { message: message("a1", "assistant", [card({ kind: "step", phase: "done", label: "Read your calendar" }), card({ kind: "step", phase: "running", label: "Finding a dentist slot" })]), parentId: "u1" },
  ];
  const [, reply] = toRows(items, at(items), { ...options, live: new Set(["a1"]) });
  assert.equal(reply!.live, true);
  assert.equal(reply!.step, "Finding a dentist slot");
  assert.equal(reply!.text, "");
  // Finished and only cards: nothing to show until cards have their own rows.
  assert.equal(toRows(items, at(items), options).length, 1);
});

test("a regenerated reply carries its versions and which one shows", () => {
  const items: StoredItem[] = [
    { message: message("u1", "user", [text("Name ideas?")]), parentId: null },
    { message: message("a1", "assistant", [text("Waakye HQ")]), parentId: "u1" },
    { message: message("a2", "assistant", [text("Ama's Kitchen")]), parentId: "u1" },
  ];
  const [, reply] = toRows(items, "a2", options);
  assert.deepEqual(reply!.versions, ["Waakye HQ", "Ama's Kitchen"]);
  assert.equal(reply!.version, 1);
  assert.deepEqual(reply!.versionIds, ["a1", "a2"]);
  assert.equal(toRows(items, "a1", options)[1]!.text, "Waakye HQ");
});

test("system rows don't show, and days read Today, Yesterday, the weekday, then the date", () => {
  const items: StoredItem[] = [{ message: message("s", "system", [text("You are Kofi")]), parentId: null }];
  assert.equal(toRows(items, "s", options).length, 0);
  assert.equal(dayLabel("2026-11-26T08:00:00", now), "Today");
  assert.equal(dayLabel("2026-11-25T23:00:00", now), "Yesterday");
  assert.equal(dayLabel("2026-11-22T08:00:00", now), new Date("2026-11-22T08:00:00").toLocaleDateString(undefined, { weekday: "long" }));
  assert.equal(dayLabel("2026-10-02T08:00:00", now), new Date("2026-10-02T08:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long" }));
});
