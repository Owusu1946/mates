import { describe, expect, it } from "vitest";
import { briefSettingsInput, nextBriefAt, type BriefSettingsInput } from "./morning-brief.js";

const settings: BriefSettingsInput = { enabled: true, time: "07:00", timezone: "Africa/Accra", weekends: "light", sections: ["calendar", "tasks"] };

describe("morning brief settings", () => {
  it("requires a real timezone, minute time and unique sections", () => {
    expect(briefSettingsInput.safeParse(settings).success).toBe(true);
    expect(briefSettingsInput.safeParse({ ...settings, timezone: "not-a-zone" }).success).toBe(false);
    expect(briefSettingsInput.safeParse({ ...settings, time: "25:00" }).success).toBe(false);
    expect(briefSettingsInput.safeParse({ ...settings, sections: ["email", "email"] }).success).toBe(false);
    expect(briefSettingsInput.safeParse({ ...settings, mutedSections: ["email"] }).success).toBe(false);
  });

  it("schedules at the chosen local time and skips weekends when off", () => {
    expect(nextBriefAt(settings, new Date("2026-11-20T06:59:00Z"))?.toISOString()).toBe("2026-11-20T07:00:00.000Z");
    expect(nextBriefAt({ ...settings, weekends: "off" }, new Date("2026-11-20T07:01:00Z"))?.toISOString()).toBe("2026-11-23T07:00:00.000Z");
  });

  it("uses the user's timezone across daylight saving and leaves disabled briefs unscheduled", () => {
    const london = { ...settings, timezone: "Europe/London" };
    expect(nextBriefAt(london, new Date("2026-03-28T07:01:00Z"))?.toISOString()).toBe("2026-03-29T06:00:00.000Z");
    expect(nextBriefAt({ ...settings, enabled: false })).toBeNull();
  });
});
