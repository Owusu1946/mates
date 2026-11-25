import { describe, expect, it } from "vitest";
import { returnTripOutcome, type ReturnTripSource } from "./return-trip-outcome.js";

describe("background work outcomes", () => {
  it.each<[ReturnTripSource, string, string]>([
    ["run", "waiting", "blocked"], ["run", "completed", "done"], ["run", "failed", "failed"],
    ["code", "done", "done"], ["code", "failed", "failed"],
    ["deck", "ready", "done"], ["deck", "failed", "failed"],
    ["mission", "needs_input", "blocked"], ["mission", "done", "done"],
    ["call", "ended", "done"], ["call", "failed", "failed"],
    ["computer", "waiting", "blocked"], ["computer", "done", "done"], ["computer", "failed", "failed"],
    ["browser", "approval", "blocked"], ["browser", "login", "blocked"],
    ["browser", "verification", "blocked"], ["browser", "user_control", "blocked"],
    ["browser", "blocked", "failed"], ["browser", "error", "failed"],
    ["browser", "expired", "failed"], ["browser", "completed", "done"],
  ])("maps %s %s to %s", (source, status, outcome) => {
    expect(returnTripOutcome(source, status)).toBe(outcome);
  });

  it.each<[ReturnTripSource, string]>([
    ["run", "cancelled"], ["run", "running"], ["code", "cancelled"],
    ["deck", "editing"], ["mission", "paused"], ["mission", "stopped"],
    ["call", "live"], ["computer", "cancelled"], ["browser", "cancelled"],
  ])("does not notify for %s %s", (source, status) => {
    expect(returnTripOutcome(source, status)).toBeNull();
  });
});
