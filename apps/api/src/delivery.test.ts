import { describe, expect, it } from "vitest";
import { findingPushBody, isProactiveRun, quietInForeground, WATCHED_REPLY_MS } from "./delivery.js";

const now = Date.parse("2026-11-16T11:00:00Z");
const started = (msAgo: number) => new Date(now - msAgo);

describe("quietInForeground", () => {
  it("hides a short chat reply while the app is open", () => {
    expect(quietInForeground({ requestKey: "assistant_1_new_", createdAt: started(5_000) }, now)).toBe(true);
    expect(quietInForeground({ requestKey: "assistant_1_new_", createdAt: started(WATCHED_REPLY_MS - 1) }, now)).toBe(true);
  });

  it("notifies once a chat reply has been running for a minute", () => {
    expect(quietInForeground({ requestKey: "assistant_1_new_", createdAt: started(WATCHED_REPLY_MS) }, now)).toBe(false);
    expect(quietInForeground({ requestKey: "assistant_1_new_", createdAt: started(5 * 60_000) }, now)).toBe(false);
  });

  it("always notifies for work the person did not just ask for in the app", () => {
    for (const requestKey of ["occurrence_1", "watch_1", "habit_1", "call_1", "manual_1", "mission_1", "slack:ask"]) {
      expect(quietInForeground({ requestKey, createdAt: started(1_000) }, now)).toBe(false);
    }
  });
});

describe("findingPushBody", () => {
  it("uses a concise first line from the saved result", () => {
    expect(findingPushBody("completed", { summary: "Prices rose 3% this week.\nMore detail follows." }))
      .toBe("Prices rose 3% this week.");
    expect(findingPushBody("completed", { summary: "Done." })).toBe("Done.");
    expect(findingPushBody("completed", undefined)).toBe("Your result is ready to view.");
  });

  it("labels waiting and failed runs accurately", () => {
    expect(findingPushBody("waiting", { summary: "Please choose one of these two options." }))
      .toBe("Needs your input: Please choose one of these two options.");
    expect(findingPushBody("failed", { summary: "Calendar access expired." }))
      .toBe("Couldn’t finish: Calendar access expired.");
    expect(findingPushBody("failed", { summary: "Your result is ready." }))
      .toBe("This task couldn’t be completed.");
    expect(findingPushBody("failed", { summary: "This task couldn’t be completed." }))
      .toBe("This task couldn’t be completed.");
  });

  it("uses clear fallbacks and caps long previews", () => {
    expect(findingPushBody("failed", undefined)).toBe("This task couldn’t be completed.");
    expect(findingPushBody("completed", { summary: `A useful result ${"with detail ".repeat(20)}` }).length).toBeLessThanOrEqual(120);
  });
});

describe("proactive run classification", () => {
  it("routes scheduled, watched, and habit runs through the proactive gate", () => {
    for (const requestKey of ["occurrence_routine_1", "watch_1_fire", "habit_1_reply"]) expect(isProactiveRun(requestKey)).toBe(true);
    for (const requestKey of ["assistant_1_new_", "manual_1", "mission_1"]) expect(isProactiveRun(requestKey)).toBe(false);
  });
});
