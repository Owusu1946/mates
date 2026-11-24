import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanMemoryText, exportMemories, groupMemories, MAX_MEMORY_CHARS, searchMemories, sourceLabel, type Memory } from "./memory.logic.ts";

const memory = (id: string, text: string, mateId: string | null = null, updatedAt = 0, category = "other"): Memory => ({ id, text, category, source: "auto", mateId, updatedAt });

const MEMORIES = [
  memory("a", "Prefers window seats", null, 1, "preference"),
  memory("b", "Budget is GH¢2,000 a month", "akua", 3, "finance"),
  memory("c", "Lives in East Legon", null, 5, "location"),
  memory("d", "Note from a mate that's gone", "gone", 2),
  memory("e", "Saves for a car", "akua", 4, "goals"),
];

test("search matches every word, in the text or the category, any case", () => {
  assert.deepEqual(searchMemories(MEMORIES, "  WINDOW seats ").map((m) => m.id), ["a"]);
  assert.deepEqual(searchMemories(MEMORIES, "finance").map((m) => m.id), ["b"]);
  assert.deepEqual(searchMemories(MEMORIES, "window legon"), []);
  assert.equal(searchMemories(MEMORIES, "   ").length, MEMORIES.length);
});

test("shared comes first, then each mate in crew order, newest first; unknown mates count as shared", () => {
  const sections = groupMemories(MEMORIES, ["lead", "akua"]);
  assert.deepEqual(
    sections.map((section) => [section.mateId, section.rows.map((m) => m.id)]),
    [
      [null, ["c", "d", "a"]],
      ["akua", ["e", "b"]],
    ],
  );
});

test("a memory must have words and fit the API's limit", () => {
  assert.equal(cleanMemoryText("  Likes jollof  "), "Likes jollof");
  assert.equal(cleanMemoryText("   "), null);
  assert.equal(cleanMemoryText("x".repeat(MAX_MEMORY_CHARS + 1)), null);
});

test("where a memory came from, in words", () => {
  assert.equal(sourceLabel("explicit"), "You asked");
  assert.equal(sourceLabel("import:chatgpt"), "Imported from ChatGPT");
  assert.equal(sourceLabel("import:other"), "Imported from another assistant");
});

test("export is plain text by section, with a dated file name", () => {
  const { text, filename } = exportMemories(MEMORIES.slice(0, 2), [{ id: "akua", name: "Akua" }], new Date(2026, 10, 24).getTime());
  assert.equal(filename, "mates-memories-2026-11-24.txt");
  assert.equal(text, "What my mates remember\n\n# Shared with every mate\n- Prefers window seats\n\n# Akua's notes\n- Budget is GH¢2,000 a month\n");
});
