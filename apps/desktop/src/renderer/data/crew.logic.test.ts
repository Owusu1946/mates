import assert from "node:assert/strict";
import { test } from "node:test";
import { previewLine, roleInput, roleLabel, timeLabel, toCrew, type ApiChat, type ApiMate, type ApiMatesBody } from "./toDesktop.logic.ts";
import { isUnread, markSeen, parseSeen } from "./unread.logic.ts";

const roles = [
  { key: "companion", label: "Companion", brief: "" },
  { key: "research", label: "Research", brief: "" },
  { key: "custom", label: "Custom", brief: "" },
];
const mate = (id: string, extra: Partial<ApiMate> = {}): ApiMate => ({ id, name: id.toUpperCase(), role: "companion", roleDescription: "", color: "amber", shape: "hexagon", isDefault: false, setupAt: "2026-11-01T00:00:00Z", chatId: `mate_${id}`, ...extra });
const chat = (id: string, kind: ApiChat["kind"], at: string | null, from = "Kofi", extra: Partial<ApiChat> = {}): ApiChat => ({ id, title: id, kind, status: "regular", mateId: null, leaderMateId: null, updatedAt: "2026-11-01T00:00:00Z", preview: at ? { from, text: `hi from ${id}`, at } : null, ...extra });
const now = new Date("2026-11-26T15:00:00");

test("every mate has its chat, even before its first message, and the newest chats come first", () => {
  const body: ApiMatesBody = { presets: { roles }, mates: [mate("kofi", { isDefault: true }), mate("esi", { role: "research" })], groups: [] };
  const crew = toCrew(body, { chats: [chat("mate_esi", "mate", "2026-11-26T14:00:00")] }, now);
  assert.equal(crew.leadId, "kofi");
  assert.deepEqual(crew.chats.map((c) => c.id), ["mate_esi", "mate_kofi"]);
  assert.equal(crew.chats[1]!.preview, "");
  assert.equal(crew.mates.find((m) => m.id === "esi")!.role, "Research");
});

test("groups keep only mates that exist, lead with their leader, and archived ones don't show", () => {
  const body: ApiMatesBody = {
    presets: { roles },
    mates: [mate("kofi", { isDefault: true }), mate("esi")],
    groups: [
      { chatId: "group_a", name: "Shop team", mateIds: ["kofi", "esi", "gone"], leaderMateId: "esi" },
      { chatId: "group_b", name: "Old", mateIds: ["kofi", "esi"], leaderMateId: null },
    ],
  };
  const crew = toCrew(body, { chats: [chat("group_b", "group", null, "Kofi", { status: "archived" })] }, now);
  const group = crew.chats.find((c) => c.id === "group_a")!;
  assert.deepEqual(group.mateIds, ["kofi", "esi"]);
  assert.equal(group.leadId, "esi");
  assert.equal(crew.chats.some((c) => c.id === "group_b"), false);
});

test("chats from before mates fold away under the lead, without archived ones", () => {
  const body: ApiMatesBody = { presets: { roles }, mates: [mate("kofi", { isDefault: true })], groups: [] };
  const crew = toCrew(body, { chats: [chat("c1", "legacy", "2026-11-02T10:00:00"), chat("c2", "routine", "2026-11-03T10:00:00"), chat("c3", "legacy", null, "x", { status: "archived" })] }, now);
  assert.deepEqual(crew.earlier.map((c) => c.id), ["c2", "c1"]);
  assert.equal(crew.earlier[0]!.kind, "thread");
  assert.equal(crew.earlier[0]!.leadId, "kofi");
});

test("a preview says who spoke in a group, and You when it was you", () => {
  assert.equal(previewLine({ from: "Akua", text: "Kumasi is cheaper", at: "" }, "group"), "Akua: Kumasi is cheaper");
  assert.equal(previewLine({ from: "Akua", text: "Kumasi is cheaper", at: "" }, "mate"), "Kumasi is cheaper");
  assert.equal(previewLine({ from: "you", text: "Thanks", at: "" }, "mate"), "You: Thanks");
  assert.equal(previewLine(null, "mate"), "");
});

test("times read like the sidebar's: the time today, the weekday this week, else the date", () => {
  assert.match(timeLabel("2026-11-26T09:05:00", now), /9:05/);
  assert.equal(timeLabel("2026-11-23T09:05:00", now), new Date("2026-11-23T09:05:00").toLocaleDateString(undefined, { weekday: "short" }));
  assert.equal(timeLabel("2026-11-02T09:05:00", now), new Date("2026-11-02T09:05:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }));
  assert.equal(timeLabel(null, now), "");
  assert.equal(timeLabel("not a date", now), "");
});

test("roles: a preset's label, or a custom role in the person's own words, both ways", () => {
  assert.equal(roleLabel({ role: "research", roleDescription: "" }, roles), "Research");
  assert.equal(roleLabel({ role: "custom", roleDescription: "Finds cheap flights\nand more" }, roles), "Finds cheap flights");
  assert.deepEqual(roleInput(" research ", roles), { role: "research", roleDescription: "" });
  assert.deepEqual(roleInput("Finds cheap flights", roles), { role: "custom", roleDescription: "Finds cheap flights" });
});

test("unread: newer than when you last looked, never your own, and nothing on a first look", () => {
  const seen = { since: Date.parse("2026-11-26T12:00:00"), chats: { a: Date.parse("2026-11-26T13:00:00") } };
  assert.equal(isUnread({ id: "a", at: "2026-11-26T14:00:00", lastFrom: "Kofi" }, seen), true);
  assert.equal(isUnread({ id: "a", at: "2026-11-26T12:30:00", lastFrom: "Kofi" }, seen), false);
  assert.equal(isUnread({ id: "b", at: "2026-11-26T11:00:00", lastFrom: "Kofi" }, seen), false);
  assert.equal(isUnread({ id: "b", at: "2026-11-26T14:00:00", lastFrom: "you" }, seen), false);
  assert.equal(isUnread({ id: "b", at: null, lastFrom: null }, seen), false);
});

test("seen times survive bad storage and only move forward", () => {
  assert.deepEqual(parseSeen("garbage", 5), { since: 5, chats: {} });
  assert.deepEqual(parseSeen(JSON.stringify({ since: 1, chats: { a: 2, b: "x" } }), 5), { since: 1, chats: { a: 2 } });
  const seen = { since: 1, chats: { a: 10 } };
  assert.equal(markSeen(seen, "a", 5), seen);
  assert.deepEqual(markSeen(seen, "a", 20).chats, { a: 20 });
});
