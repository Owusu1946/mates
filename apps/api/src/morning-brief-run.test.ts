import { describe, expect, it } from "vitest";
import { briefLocalDay } from "./morning-brief-run.js";
import { briefDayWindow, selectBriefLines } from "./morning-brief-sources.js";

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

  it("includes the whole local day, including reminders before brief time and DST changes", () => {
    const accra = briefDayWindow(new Date("2026-11-23T07:00:00Z"), "Africa/Accra");
    expect(accra.start.toISOString()).toBe("2026-11-23T00:00:00.000Z");
    expect(accra.end.toISOString()).toBe("2026-11-24T00:00:00.000Z");
    const london = briefDayWindow(new Date("2026-03-29T06:00:00Z"), "Europe/London");
    expect(london.start.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(london.end.toISOString()).toBe("2026-03-29T23:00:00.000Z");
  });

  it("uses the model's selection for all sections and rejects invented IDs", () => {
    const candidates = [candidate("task", "tasks", 1), candidate("email:1", "email", 4), candidate("email:2", "email", 4)];
    expect(selectBriefLines(candidates, ["email:2", "invented"]).map((line) => line.id)).toEqual(["email:2"]);
    expect(selectBriefLines(candidates, [])).toEqual([]);
    expect(selectBriefLines(candidates, [], false, true).map((line) => line.id)).toEqual(["task"]);
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
