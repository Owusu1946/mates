import { describe, expect, it } from "vitest";
import { nextOccurrence, routineSpecSchema, type RoutineSpec } from "./scheduling.js";
import { isReadOnlyComposioCall } from "./action-policy.js";

const daily: RoutineSpec = { title: "Brief", prompt: "Summarize news", frequency: "daily", timezone: "Africa/Accra", time: "08:00", weekday: null, onceAt: null };
describe("Timezone recurrence", () => {
  it("uses Accra local time and advances past an already due occurrence", () => {
    expect(nextOccurrence(daily, new Date("2026-10-10T07:00:00Z"))?.toISOString()).toBe("2026-10-10T08:00:00.000Z");
    expect(nextOccurrence(daily, new Date("2026-10-10T08:00:00Z"))?.toISOString()).toBe("2026-10-11T08:00:00.000Z");
  });
  it("keeps weekly weekdays in the schedule's timezone", () => {
    expect(nextOccurrence({ ...daily, frequency: "weekly", weekday: 1, timezone: "America/New_York" }, new Date("2026-10-10T10:00:00Z"))?.toISOString()).toBe("2026-10-12T12:00:00.000Z");
  });
  it("skips nonexistent spring-forward times", () => {
    expect(nextOccurrence({ ...daily, timezone: "America/New_York", time: "02:30" }, new Date("2026-03-08T05:00:00Z"))?.toISOString()).toBe("2026-03-09T06:30:00.000Z");
  });
  it("chooses the first fall-back occurrence, never two executions that day", () => {
    const spec = { ...daily, timezone: "America/New_York", time: "01:30" };
    expect(nextOccurrence(spec, new Date("2026-11-01T04:00:00Z"))?.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(nextOccurrence(spec, new Date("2026-11-01T05:31:00Z"))?.toISOString()).toBe("2026-11-02T06:30:00.000Z");
  });
  it("does not rerun a missed one-time task as a new future occurrence", () => {
    expect(nextOccurrence({ ...daily, frequency: "once", onceAt: "2026-10-10T08:00:00Z" }, new Date("2026-10-10T09:00:00Z"))).toBeNull();
  });
  it("rejects invalid zones and incomplete weekly/one-time drafts", () => {
    expect(routineSpecSchema.safeParse({ ...daily, timezone: "not-a-zone" }).success).toBe(false);
    expect(routineSpecSchema.safeParse({ ...daily, frequency: "weekly" }).success).toBe(false);
    expect(routineSpecSchema.safeParse({ ...daily, frequency: "once" }).success).toBe(false);
  });
});
describe("External action consent", () => {
  it("allows a simple read but requires approval for mixed read/write batches", () => {
    expect(isReadOnlyComposioCall("COMPOSIO_MULTI_EXECUTE_TOOL", [{ tool_slug: "GMAIL_FETCH_EMAILS" }])).toBe(true);
    expect(isReadOnlyComposioCall("COMPOSIO_MULTI_EXECUTE_TOOL", [{ tool_slug: "GMAIL_FETCH_EMAILS" }, { tool_slug: "GMAIL_SEND_EMAIL" }])).toBe(false);
  });
  it("does not mistake get-or-create or executable workbenches for harmless reads", () => {
    expect(isReadOnlyComposioCall("COMPOSIO_MULTI_EXECUTE_TOOL", [{ tool_slug: "APP_GET_OR_CREATE_CONTACT" }])).toBe(false);
    expect(isReadOnlyComposioCall("COMPOSIO_REMOTE_WORKBENCH", [])).toBe(false);
    expect(isReadOnlyComposioCall("COMPOSIO_MULTI_EXECUTE_TOOL", [])).toBe(false);
  });
});
