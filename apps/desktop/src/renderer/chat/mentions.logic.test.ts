import assert from "node:assert/strict";
import { test } from "node:test";
import { addPick, hasPicks, mentionChoices, mentionQuery, NO_PICKS, tagsOf, withoutMention } from "./mentions.logic.ts";

const MATES = [
  { id: "lead", name: "Kofi" },
  { id: "esi", name: "Esi" },
  { id: "akua", name: "Akua" },
];
const APPS = [
  { slug: "gmail", name: "Gmail" },
  { slug: "googlecalendar", name: "Google Calendar" },
];
const base = { query: "", kind: "mate" as const, primaryMateId: "lead", members: [], ownedMates: MATES, connectedApps: APPS, picks: NO_PICKS };
const ids = (choices: ReturnType<typeof mentionChoices>) => choices.map((choice) => choice.id);

test("an @ word is found only where it starts, up to the cursor", () => {
  assert.equal(mentionQuery("ask @Es"), "es");
  assert.equal(mentionQuery("@"), "");
  assert.equal(mentionQuery("mail me@home"), null, "an email isn't a mention");
  assert.equal(mentionQuery("ask @esi then"), null, "a space ends it");
});

test("picking takes the @ word out and keeps the rest of the draft", () => {
  assert.equal(withoutMention("ask @es", 7), "ask ");
  assert.equal(withoutMention("@we", 3), "");
  assert.equal(withoutMention("ask @es about rent", 7), "ask about rent");
});

test("a direct chat offers web search, Chief of Staff, your other mates and connected apps, in that order", () => {
  assert.deepEqual(ids(mentionChoices(base)), ["web", "chief", "mate:esi", "mate:akua", "app:gmail", "app:googlecalendar"]);
  assert.deepEqual(ids(mentionChoices({ ...base, query: "goo" })), ["app:googlecalendar"]);
  assert.deepEqual(ids(mentionChoices({ ...base, query: "se" })), ["web"], "\"se\" could still be search");
});

test("a group offers its own members, and no Chief of Staff", () => {
  const group = { ...base, kind: "group" as const, members: [MATES[0]!, MATES[2]!] };
  assert.deepEqual(ids(mentionChoices(group)), ["web", "mate:lead", "mate:akua", "app:gmail", "app:googlecalendar"]);
});

test("picks gather into chips and aren't offered twice", () => {
  let picks = addPick(NO_PICKS, { kind: "mate", id: "mate:esi", mate: MATES[1]! });
  picks = addPick(picks, { kind: "mate", id: "mate:esi", mate: MATES[1]! });
  picks = addPick(picks, { kind: "web", id: "web" });
  picks = addPick(picks, { kind: "app", id: "app:gmail", app: APPS[0]! });
  picks = addPick(picks, { kind: "app", id: "app:googlecalendar", app: APPS[1]! });
  assert.deepEqual(picks, { web: true, chief: false, mates: [MATES[1]], app: APPS[1] }, "one app at a time");
  assert.equal(hasPicks(picks), true);
  assert.equal(hasPicks(NO_PICKS), false);
  assert.deepEqual(ids(mentionChoices({ ...base, picks })), ["chief", "mate:akua", "app:gmail"]);
  assert.deepEqual(tagsOf(picks).map((tag) => tag.label), ["Esi", "Google Calendar", "Web search"]);
});
