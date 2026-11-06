import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./waitlist.js";

describe("waitlist", () => {
  it("accepts plausible addresses, trimmed and lower-cased", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(normalizeEmail("first.last+mates@sub.domain.io")).toBe("first.last+mates@sub.domain.io");
  });

  it("turns away anything that isn't an address", () => {
    expect(normalizeEmail("ada@example")).toBeNull();
    expect(normalizeEmail("ada example.com")).toBeNull();
    expect(normalizeEmail("@example.com")).toBeNull();
    expect(normalizeEmail(`${"a".repeat(250)}@x.io`)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});
