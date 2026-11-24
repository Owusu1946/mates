import assert from "node:assert/strict";
import { test } from "node:test";
import { matchScore, moveActive, rankCommands, type Command } from "./commandPalette.logic.ts";

const commands: Command[] = [
  { id: "a", label: "Settings", group: "Actions" },
  { id: "esi", label: "Esi", group: "Go to", hint: "Research" },
  { id: "dark", label: "Dark mode", group: "Actions", keywords: ["theme"] },
  { id: "run", label: "Fix the iOS sign-in sheet", group: "Runs" },
  { id: "shop", label: "Shop team", group: "Go to" },
];

test("starting with the query beats a word inside, which beats containing it, then letters in order", () => {
  assert.equal(matchScore("Settings", "set"), 3);
  assert.equal(matchScore("Fix the iOS sign-in sheet", "sign"), 2);
  assert.equal(matchScore("Shop team", "op"), 1);
  assert.equal(matchScore("Dark mode", "dkm"), 0.5);
  assert.equal(matchScore("Esi", "yaw"), 0);
});

test("an empty query lists everything, groups in order", () => {
  assert.deepEqual(rankCommands(commands, "").map((command) => command.id), ["esi", "shop", "run", "a", "dark"]);
});

test("typing narrows every group, and keywords count too", () => {
  assert.deepEqual(rankCommands(commands, "s").map((command) => command.id), ["shop", "esi", "run", "a"]);
  assert.deepEqual(rankCommands(commands, "theme").map((command) => command.id), ["dark"]);
  assert.deepEqual(rankCommands(commands, "zzz"), []);
});

test("arrow keys wrap at the ends", () => {
  assert.equal(moveActive(0, 3, -1), 2);
  assert.equal(moveActive(2, 3, 1), 0);
  assert.equal(moveActive(0, 0, 1), 0);
});
