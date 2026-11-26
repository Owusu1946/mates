import { describe, expect, it } from "vitest";
import { returnTripSummary } from "./return-trip-summary.js";

const text = (value: string) => ({ type: "text", text: value });

describe("finding copy for a run transition", () => {
  it("uses the new answer when a waiting run resumes under a new delegation", () => {
    expect(returnTripSummary({ status: "completed", error: null, content: [text("Choose an option."), text("Invoice sent." )], request: { resumeRunId: "previous" } }))
      .toBe("Invoice sent.");
  });

  it("uses the failure reason before earlier success text", () => {
    expect(returnTripSummary({ status: "failed", error: "The restaurant is closed on Mondays.", content: [text("I found the restaurant.")], request: {} }))
      .toBe("The restaurant is closed on Mondays.");
  });

  it("keeps the full result for an ordinary completed run and a clear fallback for empty failures", () => {
    expect(returnTripSummary({ status: "completed", error: null, content: [text("First finding."), text("Second finding.")], request: {} }))
      .toBe("First finding.\nSecond finding.");
    expect(returnTripSummary({ status: "failed", error: null, content: [], request: {} }))
      .toBe("This task couldn’t be completed.");
  });
});
