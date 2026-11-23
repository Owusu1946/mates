import { describe, expect, it } from "vitest";
import { briefLocalDay } from "./morning-brief-run.js";
import { selectBriefLines } from "./morning-brief-sources.js";

type Candidate = Parameters<typeof selectBriefLines>[0][number];

const candidate = (id: string, section: Candidate["section"], priority: number): Candidate => ({
  id, section, priority, text: id,
  action: section === "email" ? { kind: "email", threadId: id } : { kind: "tasks", reminderId: id },
});

describe("morning brief delivery rules", () => {
  it("keys an occurrence to the user's local day", () => {
    const instant = new Date("2026-11-23T00:30:00Z");
    expect(briefLocalDay(instant, "Africa/Accra")).toBe("2026-11-23");
    expect(briefLocalDay(instant, "America/Los_Angeles")).toBe("2026-11-22");
  });

  it("keeps actionable non-email facts and only selected email threads", () => {
    const candidates = [candidate("task", "tasks", 1), candidate("email:1", "email", 4), candidate("email:2", "email", 4)];
    expect(selectBriefLines(candidates, ["email:2", "invented"]).map((line) => line.id)).toEqual(["task", "email:2"]);
  });

  it("caps normal and light briefs, including their email limits", () => {
    const candidates = [
      ...Array.from({ length: 3 }, (_, index) => candidate(`task:${index}`, "tasks", 1)),
      ...Array.from({ length: 6 }, (_, index) => candidate(`email:${index}`, "email", 4)),
    ];
    const chosen = candidates.map(({ id }) => id);
    expect(selectBriefLines(candidates, chosen)).toHaveLength(6);
    expect(selectBriefLines(candidates, chosen).filter((line) => line.section === "email")).toHaveLength(3);
    expect(selectBriefLines(candidates, chosen, true)).toHaveLength(4);
    expect(selectBriefLines(candidates, chosen, true).filter((line) => line.section === "email")).toHaveLength(1);
  });
});
