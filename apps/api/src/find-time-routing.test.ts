import { describe, expect, it, vi } from "vitest";
import { findTimeTool } from "./mate-requests.js";
import { playbookGuidance } from "./playbooks.js";

vi.mock("./db/client.js", () => ({ getDb: () => { throw new Error("no database in tests"); } }));

// "Find a time with Samuel for lunch" once went to Gmail to look Samuel up and to the calendar to
// guess a slot. Meeting someone belongs to cooper_find_time, which finds them by name itself.
describe("routing meetings with a person", () => {
  it("steers the calendar tools' tip to cooper_find_time, and away from searching email", () => {
    const tip = playbookGuidance("googlecalendar")!;
    expect(tip).toContain("cooper_find_time");
    expect(tip).toMatch(/never search email or contacts/i);
  });

  it("tells the model to prefer cooper_find_time over the calendar and email tools", () => {
    expect(findTimeTool.function.description).toMatch(/instead of the calendar or email tools/);
    expect(findTimeTool.function.description).toMatch(/never search email or contacts/);
  });
});
