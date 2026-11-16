import assert from "node:assert/strict";
import { test } from "node:test";
import { mentionMatesForChat, showChiefOfStaff } from "./mention-choices.ts";

const ama = { id: "ama", name: "Ama" };
const scout = { id: "scout", name: "Scout" };

test("a direct chat offers the user's other mates, not itself", () => {
  const offered = mentionMatesForChat({ kind: "mate", primaryMateId: "scout", groupMembers: [], ownedMates: [scout, ama], query: "" });
  assert.deepEqual(offered.map((mate) => mate.id), ["ama"]);
  assert.equal(showChiefOfStaff("mate", ""), true);
  assert.equal(showChiefOfStaff("mate", "chi"), true);
  assert.equal(showChiefOfStaff("mate", "ama"), false);
});

test("a group offers its members and not Chief of Staff", () => {
  const offered = mentionMatesForChat({ kind: "group", primaryMateId: null, groupMembers: [scout, ama], ownedMates: [scout, ama], query: "sc" });
  assert.deepEqual(offered.map((mate) => mate.name), ["Scout"]);
  assert.equal(showChiefOfStaff("group", ""), false);
});

test("legacy chats do not offer mates", () => {
  assert.deepEqual(mentionMatesForChat({ kind: "legacy", primaryMateId: null, groupMembers: [], ownedMates: [ama], query: "" }), []);
});
