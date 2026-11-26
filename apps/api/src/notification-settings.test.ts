import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATE_NOTIFICATION_SETTINGS,
  isWithinQuietHours,
  mateNotificationSettingsInput,
  nextQuietHoursEnd,
  proactivePushDecision,
} from "./notification-settings.js";

describe("mate notification settings", () => {
  it("uses normal notifications and 22:00–07:00 as the defaults", () => {
    expect(DEFAULT_MATE_NOTIFICATION_SETTINGS).toEqual({ mode: "normal", quietStart: "22:00", quietEnd: "07:00" });
    expect(mateNotificationSettingsInput.safeParse(DEFAULT_MATE_NOTIFICATION_SETTINGS).success).toBe(true);
  });

  it("accepts only supported modes and valid local 24-hour times", () => {
    expect(mateNotificationSettingsInput.safeParse({ mode: "urgent_only", quietStart: "08:30", quietEnd: "17:45" }).success).toBe(true);
    expect(mateNotificationSettingsInput.safeParse({ mode: "always", quietStart: "22:00", quietEnd: "07:00" }).success).toBe(false);
    expect(mateNotificationSettingsInput.safeParse({ mode: "normal", quietStart: "24:00", quietEnd: "07:00" }).success).toBe(false);
    expect(mateNotificationSettingsInput.safeParse({ mode: "normal", quietStart: "22:00", quietEnd: "7:00", extra: true }).success).toBe(false);
  });

  it("applies both overnight and daytime quiet intervals in the selected timezone", () => {
    const overnight = { timezone: "Africa/Accra", quietStart: "22:00", quietEnd: "07:00" };
    expect(isWithinQuietHours({ ...overnight, now: new Date("2026-11-25T22:00:00Z") })).toBe(true);
    expect(isWithinQuietHours({ ...overnight, now: new Date("2026-11-26T06:59:00Z") })).toBe(true);
    expect(isWithinQuietHours({ ...overnight, now: new Date("2026-11-26T07:00:00Z") })).toBe(false);

    const daytime = { timezone: "Africa/Accra", quietStart: "09:00", quietEnd: "17:00" };
    expect(isWithinQuietHours({ ...daytime, now: new Date("2026-11-25T12:00:00Z") })).toBe(true);
    expect(isWithinQuietHours({ ...daytime, now: new Date("2026-11-25T18:00:00Z") })).toBe(false);
  });

  it("treats equal endpoints as disabled and invalid timezones as outside quiet hours", () => {
    expect(isWithinQuietHours({ timezone: "Africa/Accra", quietStart: "08:00", quietEnd: "08:00", now: new Date("2026-11-25T08:30:00Z") })).toBe(false);
    expect(isWithinQuietHours({ timezone: "not/a-zone", quietStart: "22:00", quietEnd: "07:00", now: new Date("2026-11-25T23:00:00Z") })).toBe(false);
  });

  it("schedules deferred notices for the next quiet-hours end in local time", () => {
    expect(nextQuietHoursEnd(new Date("2026-11-25T23:30:00Z"), "Africa/Accra", "07:00")?.toISOString()).toBe("2026-11-26T07:00:00.000Z");
    expect(nextQuietHoursEnd(new Date("2026-11-25T06:59:00Z"), "Africa/Accra", "07:00")?.toISOString()).toBe("2026-11-25T07:00:00.000Z");
    expect(nextQuietHoursEnd(new Date("2026-11-25T23:30:00Z"), "not/a-zone", "07:00")).toBeNull();
  });

  it("enforces per-mate and per-user budgets while preserving urgent and off choices", () => {
    const base = { mode: "normal" as const, urgent: false, mateSentToday: 0, userSentToday: 0 };
    expect(proactivePushDecision(base)).toBe("send");
    expect(proactivePushDecision({ ...base, mateSentToday: 1 })).toBe("mate_daily_limit");
    expect(proactivePushDecision({ ...base, userSentToday: 3 })).toBe("user_daily_limit");
    expect(proactivePushDecision({ ...base, urgent: true, mateSentToday: 10, userSentToday: 10 })).toBe("send");
    expect(proactivePushDecision({ ...base, mode: "urgent_only" })).toBe("urgent_only");
    expect(proactivePushDecision({ ...base, mode: "urgent_only", urgent: true })).toBe("send");
    expect(proactivePushDecision({ ...base, mode: "off", urgent: true })).toBe("disabled");
  });
});
