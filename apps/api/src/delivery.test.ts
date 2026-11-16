import { describe, expect, it } from "vitest";
import { quietInForeground, WATCHED_REPLY_MS } from "./delivery.js";

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
