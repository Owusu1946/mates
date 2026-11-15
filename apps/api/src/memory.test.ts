import { describe, expect, it } from "vitest";
import { checkWithMate, composeMemoryContext, memoryCard, memoryInputSchema, runMemoryTool, shouldAskAbout } from "./memory.js";

describe("memory", () => {
  it("rejects malformed tool calls before touching storage", async () => {
    expect((await runMemoryTool("user_1", undefined, { action: "remember" })).result).toEqual({ error: "Invalid memory request." });
    expect((await runMemoryTool("user_1", undefined, { action: "save", text: "  " })).result).toEqual({ error: "A memory needs short text." });
    expect((await runMemoryTool("user_1", undefined, { action: "forget" })).result).toEqual({ error: "Pass the memory id from the saved-memories list." });
  });

  it("keeps memories short and categorised", () => {
    expect(memoryInputSchema.parse({ text: "Prefers bullet points" })).toEqual({ text: "Prefers bullet points", category: "other", importance: 2 });
    expect(memoryInputSchema.safeParse({ text: "x".repeat(501) }).success).toBe(false);
    expect(memoryInputSchema.safeParse({ text: "Lives in Accra", category: "address" }).success).toBe(false);
  });

  it("labels the chat card by what happened", () => {
    expect(memoryCard({ id: "m1", text: "Lives in Accra", action: "saved" })).toMatchObject({ kind: "memory", label: "Memory updated" });
    expect(memoryCard({ id: "m1", text: "Lives in Accra", action: "forgotten" }).label).toBe("Memory removed");
  });
});

describe("each mate's memory", () => {
  const speaker = { id: "esi", name: "Esi", role: "money", roleDescription: "Keeps an eye on money" };
  const crew = [
    { id: "kofi", name: "Kofi", role: "companion", roleDescription: "Your lead mate" },
    { id: "esi", name: "Esi", role: "money", roleDescription: "Keeps an eye on money" },
  ];
  const base = {
    speaker,
    lead: false,
    bio: "I run a bakery in Osu.",
    shared: [{ id: "s1", text: "Lives in Accra", category: "location", mateId: null }],
    own: [{ id: "o1", text: "Supplies budget is GH₵6,000 a month", category: "finance", mateId: "esi" }],
    crewNotes: [{ id: "c1", text: "Trains on Tuesdays", category: "health", mateId: "kofi" }],
    crew,
    askAbout: false,
  };

  it("gives a specialist the bio, the shared memories and only its own notes", () => {
    const context = composeMemoryContext(base);
    expect(context).toContain("I run a bakery in Osu.");
    expect(context).toContain("Lives in Accra");
    expect(context).toContain("Your own notes as Esi");
    expect(context).toContain("Supplies budget");
    expect(context).not.toContain("Trains on Tuesdays");
    expect(context).toContain("Kofi (Your lead mate)");
    expect(context).not.toContain("one short, natural question");
  });

  it("lets the lead see what the crew knows, labelled by mate", () => {
    const context = composeMemoryContext({ ...base, speaker: { ...crew[0]!, roleDescription: "Your lead mate" }, lead: true, own: [], crewNotes: [{ id: "c2", text: "Saving for a van", category: "finance", mateId: "esi" }] });
    expect(context).toContain("What your crew knows");
    expect(context).toContain("(Esi) Saving for a van");
    // The lead saves for everyone; only specialists keep notes of their own.
    expect(context).toContain("As the lead, save everything as shared");
    expect(context).not.toContain('scope "mine"');
    expect(composeMemoryContext(base)).toContain('scope "mine"');
  });

  it("trims a long bio and invites one question only when asked to", () => {
    const context = composeMemoryContext({ ...base, bio: "x".repeat(3_000), askAbout: true });
    expect(context).toContain(`${"x".repeat(1_200)}…`);
    expect(context).not.toContain("x".repeat(1_201));
    expect(context).toContain("one short, natural question");
  });

  it("asks about the user at most once a day, in the first week, without a bio", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const day = 86_400_000;
    const since = new Date(now.getTime() - 2 * day);
    expect(shouldAskAbout({ bio: null, aboutAskedAt: null }, since, now)).toBe(true);
    expect(shouldAskAbout({ bio: "  ", aboutAskedAt: null }, since, now)).toBe(true);
    expect(shouldAskAbout({ bio: "I bake", aboutAskedAt: null }, since, now)).toBe(false);
    expect(shouldAskAbout({ bio: null, aboutAskedAt: new Date(now.getTime() - 3_600_000) }, since, now)).toBe(false);
    expect(shouldAskAbout({ bio: null, aboutAskedAt: new Date(now.getTime() - day) }, since, now)).toBe(true);
    expect(shouldAskAbout({ bio: null, aboutAskedAt: null }, new Date(now.getTime() - 8 * day), now)).toBe(false);
    expect(shouldAskAbout({ bio: null, aboutAskedAt: null }, null, now)).toBe(false);
  });

  it("rejects a check with no mate or question before touching storage", async () => {
    expect(await checkWithMate("user_1", "esi", { mate: "", question: "budget" })).toMatchObject({ ok: false });
    expect(await checkWithMate("user_1", "esi", { mate: "Kofi" })).toMatchObject({ ok: false });
  });

  it("accepts a memory scope only of shared or mine", async () => {
    expect((await runMemoryTool("user_1", undefined, { action: "save", text: "x", scope: "everyone" })).result).toEqual({ error: "Invalid memory request." });
  });
});
