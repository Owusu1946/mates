import { describe, expect, it } from "vitest";
import { normaliseStep, notesDigest } from "./missions.js";

const raw = (fields: Partial<Parameters<typeof normaliseStep>[0]>) => ({ action: "assign" as const, handoff: "", question: "", final_task: "", assignments: [], ...fields });

describe("mission rounds", () => {
  it("keeps only real teammates and drops the handoff when the leader works alone", () => {
    expect(normaliseStep(raw({ handoff: "Rhea, research it", assignments: [{ mate_id: "rhea", task: "Find 3 markets" }, { mate_id: "ghost", task: "x" }] }), ["lead", "rhea"], "lead")).toEqual({
      action: "assign",
      handoff: "Rhea, research it",
      assignments: [{ mateId: "rhea", task: "Find 3 markets" }],
    });
    expect(normaliseStep(raw({ handoff: "ignored", assignments: [{ mate_id: "lead", task: "Draft" }] }), ["lead"], "lead")).toMatchObject({ handoff: "" });
  });

  it("asks the user instead of running an empty round", () => {
    expect(normaliseStep(raw({ assignments: [{ mate_id: "ghost", task: "x" }] }), ["lead"], "lead").action).toBe("checkin");
    expect(normaliseStep(raw({ action: "checkin", question: "Which idea?" }), ["lead"], "lead")).toEqual({ action: "checkin", question: "Which idea?" });
  });

  it("finishes with a default compile task when the leader gives none", () => {
    expect(normaliseStep(raw({ action: "finish" }), ["lead"], "lead")).toMatchObject({ action: "finish", task: expect.stringContaining("Compile") });
  });

  it("keeps the shared notes short enough for every prompt", () => {
    const long = { title: "Research", content: "x".repeat(5_000), version: 2, author: "Rhea" };
    const digest = notesDigest([long, { title: "Numbers", content: "Revenue y1: 10k", version: 1, author: null }]);
    expect(digest).toContain("### Research (v2, by Rhea)");
    expect(digest).toContain("read the full note");
    expect(digest).toContain("Revenue y1: 10k");
    expect(notesDigest([])).toBe("(no notes yet)");
  });
});
