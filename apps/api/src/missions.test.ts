import { describe, expect, it } from "vitest";
import { notesDigest } from "./missions.js";

describe("mission notes", () => {
  it("keeps the shared notes short enough for every prompt", () => {
    const long = { title: "Research", content: "x".repeat(5_000), version: 2, author: "Rhea" };
    const digest = notesDigest([long, { title: "Numbers", content: "Revenue y1: 10k", version: 1, author: null }]);
    expect(digest).toContain("### Research (v2, by Rhea)");
    expect(digest).toContain("read the full note");
    expect(digest).toContain("Revenue y1: 10k");
    expect(notesDigest([])).toBe("(no notes yet)");
  });
});
