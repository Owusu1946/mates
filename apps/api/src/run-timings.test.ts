import { describe, expect, it } from "vitest";
import { hasVisibleText } from "./run-timings.js";

describe("first visible answer text", () => {
  it("ignores placeholder cards and whitespace until an answer is saved", () => {
    expect(hasVisibleText([{ type: "tool-call", result: { label: "Starting" } }])).toBe(false);
    expect(hasVisibleText([{ type: "text", text: "  " }])).toBe(false);
    expect(hasVisibleText([{ type: "tool-call" }, { type: "text", text: "Hello" }])).toBe(true);
  });
});
