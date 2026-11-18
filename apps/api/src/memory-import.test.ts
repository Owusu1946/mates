import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { cleanImported, exportText, findKnown, importConfirmSchema, importRequestSchema, MAX_IMPORT_FACTS } from "./memory-import.js";

const fact = (text: string, extra: Record<string, unknown> = {}) => ({ text, category: "identity", importance: 2, sensitive: false, sameAs: "", conflictsWith: "", ...extra });

describe("memory import", () => {
  it("never keeps secrets, whatever the model returns", () => {
    const { facts } = cleanImported(
      [fact("Lives in Accra"), fact("Card number is 4111 1111 1111 1111"), fact("Bank account 0123456789012"), fact("Wifi password is hunter2"), fact("Their PIN is 4821"), fact("Budget is GH₵6,000 a month", { category: "finance" })],
      new Set(),
    );
    expect(facts.map((f) => f.text)).toEqual(["Lives in Accra", "Budget is GH₵6,000 a month"]);
  });

  it("strips list markers and dates, fixes categories and drops repeats", () => {
    const { facts } = cleanImported([fact("[2025-03-01] - Lives in Accra"), fact("- lives in accra"), fact("Likes jollof", { category: "food", importance: 9 }), "junk", null], new Set());
    expect(facts).toEqual([
      expect.objectContaining({ text: "Lives in Accra" }),
      expect.objectContaining({ text: "Likes jollof", category: "other", importance: 3 }),
    ]);
  });

  it("keeps ids only for memories the model was shown, and flags health as sensitive", () => {
    const shown = new Set(["m1"]);
    const { facts } = cleanImported([fact("Lives in Kumasi", { conflictsWith: "m1" }), fact("Works at Hubtel", { sameAs: "made-up" }), fact("Has asthma", { category: "health" })], shown);
    expect(facts[0]).toMatchObject({ conflictsWith: "m1", sameAs: null });
    expect(facts[1]).toMatchObject({ sameAs: null, conflictsWith: null });
    expect(facts[2]).toMatchObject({ sensitive: true });
  });

  it("caps how many facts one import brings", () => {
    const { facts, truncated } = cleanImported(Array.from({ length: 200 }, (_, i) => fact(`Fact number ${i} about them`)), new Set());
    expect(facts).toHaveLength(MAX_IMPORT_FACTS);
    expect(truncated).toBe(true);
  });

  it("sets aside facts Mates already has: the model's word or a near-identical embedding", () => {
    const facts = cleanImported([fact("Lives in Accra", { sameAs: "m1" }), fact("Calls their mum on Sundays"), fact("Plays the guitar")], new Set(["m1"])).facts;
    const existing = [{ id: "m2", embedding: [1, 0, 0] }, { id: "m3", embedding: null }];
    expect(findKnown(facts, [null, [0.99, 0.05, 0], [0, 1, 0]], existing)).toEqual(["m1", "m2", null]);
  });

  it("validates what the app sends", () => {
    expect(importRequestSchema.safeParse({ source: "chatgpt", text: "too short" }).success).toBe(false);
    expect(importRequestSchema.safeParse({ source: "bard", text: "x".repeat(40) }).success).toBe(false);
    expect(importRequestSchema.safeParse({ source: "grok", text: "x".repeat(50_001) }).success).toBe(false);
    expect(importConfirmSchema.safeParse({ source: "claude", items: [] }).success).toBe(false);
    expect(importConfirmSchema.safeParse({ source: "claude", items: [{ text: "Lives in Accra", category: "address", importance: 2, replaces: "not-a-uuid" }] }).success).toBe(false);
    expect(importConfirmSchema.parse({ source: "claude", items: [{ text: "Lives in Accra", category: "address", importance: 7 }] }).items[0]).toMatchObject({ category: "other", importance: 2 });
  });
});

describe("memory export", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  const at = new Date("2026-03-01T09:00:00Z");

  it("writes dated lines grouped by category, then each mate's notes", () => {
    const text = exportText({
      memories: [
        { text: "Prefers short replies", category: "preference", mateId: null, updatedAt: at },
        { text: "Lives in Accra", category: "location", mateId: null, updatedAt: at },
        { text: "Name is Kenneth", category: "identity", mateId: null, updatedAt: at },
        { text: "Supplies budget is GH₵6,000", category: "finance", mateId: "esi", updatedAt: at },
        { text: "Odd one", category: "mystery", mateId: null, updatedAt: at },
      ],
      mates: [{ id: "kofi", name: "Kofi" }, { id: "esi", name: "Esi" }],
      bio: "I run a bakery in Osu.",
      now,
    });
    expect(text).toBe(
      [
        "What my AI mates in Mates remember about me (exported 2026-11-18)",
        "",
        "## In my own words",
        "I run a bakery in Osu.",
        "",
        "## About me",
        "[2026-03-01] - Name is Kenneth",
        "",
        "## Places",
        "[2026-03-01] - Lives in Accra",
        "",
        "## Preferences",
        "[2026-03-01] - Prefers short replies",
        "",
        "## Other",
        "[2026-03-01] - Odd one",
        "",
        "## Esi’s notes",
        "[2026-03-01] - Supplies budget is GH₵6,000",
      ].join("\n"),
    );
  });

  it("says so when there's nothing", () => {
    expect(exportText({ memories: [], mates: [], bio: "", now })).toContain("Nothing saved yet.");
  });
});

describe("memory import routes", () => {
  const deps = { verifyToken: vi.fn(async () => ({ sub: "user_123" })), findProfile: vi.fn(async () => null), requestChat: vi.fn() };
  const send = (path: string, method: string, body?: object) =>
    createApp(deps).request(path, { method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

  it("rejects bad pastes and unknown imports before any work", async () => {
    const short = await send("/v1/memories/import", "POST", { source: "chatgpt", text: "hi" });
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ error: { code: "INVALID_IMPORT" } });
    expect((await send("/v1/memories/import/confirm", "POST", { source: "chatgpt", items: [] })).status).toBe(400);
    expect((await send("/v1/memories?source=import:bard", "DELETE")).status).toBe(400);
    expect((await send("/v1/memories?source=auto", "DELETE")).status).toBe(400);
  });
});
