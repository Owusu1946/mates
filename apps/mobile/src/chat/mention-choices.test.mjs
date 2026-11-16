import assert from "node:assert/strict";
import { test } from "node:test";
import { mentionMatesForChat, showChiefOfStaff, mentionDraft, webSearchDraft, collaboratorRefreshDue } from "./mention-choices.ts";

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

test("choosing a mention only rewrites the draft", () => {
  assert.equal(mentionDraft("hey @sc", "Scout"), "hey @Scout ");
  assert.equal(mentionDraft("@chi", "Chief of Staff"), "@Chief of Staff ");
  assert.equal(webSearchDraft("hey @web"), "hey ");
  assert.equal(webSearchDraft("@search"), "");
  assert.equal(collaboratorRefreshDue(false, false, true), false);
  assert.equal(collaboratorRefreshDue(true, true, true), false);
  assert.equal(collaboratorRefreshDue(true, false, true), true);
  assert.equal(collaboratorRefreshDue(true, false, false), false);
});
