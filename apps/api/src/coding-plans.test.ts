import { describe, expect, it } from "vitest";
import { canCode, CODING_PLANS } from "./usage/plans.js";

describe("who gets the mates' computer", () => {
  it("is Pro and Max only", () => {
    expect([...CODING_PLANS]).toEqual(["pro", "max"]);
    expect(canCode("pro")).toBe(true);
    expect(canCode("max")).toBe(true);
    expect(canCode("plus")).toBe(false);
    expect(canCode("starter")).toBe(false);
    expect(canCode("none")).toBe(false);
  });
});
