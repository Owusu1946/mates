import { describe, expect, it } from "vitest";
import { aboutSchema, MAX_BIO_CHARS } from "./about.js";

describe("about you", () => {
  it("accepts an empty bio (clearing it) and caps its length", () => {
    expect(aboutSchema.safeParse({ bio: "" }).success).toBe(true);
    expect(aboutSchema.safeParse({ bio: "x".repeat(MAX_BIO_CHARS) }).success).toBe(true);
    expect(aboutSchema.safeParse({ bio: "x".repeat(MAX_BIO_CHARS + 1) }).success).toBe(false);
    expect(aboutSchema.safeParse({}).success).toBe(false);
  });
});
