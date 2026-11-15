import { describe, expect, it } from "vitest";
import { aboutSchema, MAX_BIO_CHARS, mateGreeting, mateMessage } from "./about.js";

describe("about you", () => {
  it("accepts an empty bio (clearing it) and caps its length", () => {
    expect(aboutSchema.safeParse({ bio: "" }).success).toBe(true);
    expect(aboutSchema.safeParse({ bio: "x".repeat(MAX_BIO_CHARS) }).success).toBe(true);
    expect(aboutSchema.safeParse({ bio: "x".repeat(MAX_BIO_CHARS + 1) }).success).toBe(false);
    expect(aboutSchema.safeParse({}).success).toBe(false);
  });

  it("takes the onboarding wait and the forget-what-was-learned choice", () => {
    expect(aboutSchema.parse({ bio: "", forgetLearned: true })).toEqual({ bio: "", forgetLearned: true });
    expect(aboutSchema.parse({ bio: "I bake", wait: true }).wait).toBe(true);
    expect(aboutSchema.safeParse({ bio: "", wait: "yes" }).success).toBe(false);
  });
});

describe("a new mate's hello", () => {
  it("says the lead filled it in only when there was something to pass on", () => {
    expect(mateGreeting({ name: "Esi", role: "money" }, "Kofi", true, "Money")).toBe("Hi, I’m Esi, your money mate. Kofi filled me in on you, so we can skip the introductions. What can I help with?");
    expect(mateGreeting({ name: "Esi", role: "money" }, "Kofi", false, "Money")).toBe("Hi, I’m Esi, your money mate. Tell me a little about what you’d like help with, and I’ll take it from there.");
  });

  it("doesn't name a custom or companion role", () => {
    expect(mateGreeting({ name: "Ama", role: "custom" }, "Kofi", true, "Custom")).toMatch(/^Hi, I’m Ama\. Kofi/);
    expect(mateGreeting({ name: "Ama", role: "companion" }, null, true, "Companion")).toMatch(/^Hi, I’m Ama\. Your lead mate/);
  });

  it("is stored as a finished assistant message the chat renders", () => {
    const message = mateMessage("hello_1", "Hi");
    expect(message).toMatchObject({ id: "hello_1", role: "assistant", content: [{ type: "text", text: "Hi" }], status: { type: "complete" } });
    // A chip-only message carries no empty text part.
    const chip = mateMessage("about_1", "", [{ kind: "memories", phase: "done", label: "Memory updated", memories: { count: 4 } }]);
    expect(chip.content).toHaveLength(1);
    expect(chip.content[0]).toMatchObject({ type: "tool-call", result: { kind: "memories", memories: { count: 4 } } });
  });
});
