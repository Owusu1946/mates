import assert from "node:assert/strict";
import { test } from "node:test";
import { matchMates, mentionQuery, withoutMention } from "./summonInput.logic.ts";

test("a mention is the @word at the end of what you're typing", () => {
  assert.equal(mentionQuery("@"), "");
  assert.equal(mentionQuery("@es"), "es");
  assert.equal(mentionQuery("find hostels @Es"), "Es");
  assert.equal(mentionQuery("mail me@work"), null, "an email address isn't a mention");
  assert.equal(mentionQuery("@esi find hostels"), null, "only while you're still typing it");
  assert.equal(mentionQuery("no mention"), null);
});

test("choosing a mate takes the mention out of the text", () => {
  assert.equal(withoutMention("@es"), "");
  assert.equal(withoutMention("find hostels @es"), "find hostels ");
});

test("mates whose names start with it come first, then names or roles that contain it", () => {
  const mates = [
    { name: "Esi", role: "Research" },
    { name: "Yaw", role: "Builder" },
    { name: "Kwesi", role: "Money" },
  ];
  assert.deepEqual(matchMates(mates, "es").map((mate) => mate.name), ["Esi", "Kwesi"]);
  assert.deepEqual(matchMates(mates, "build").map((mate) => mate.name), ["Yaw"]);
  assert.deepEqual(matchMates(mates, "").map((mate) => mate.name), ["Esi", "Yaw", "Kwesi"]);
});
