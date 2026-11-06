import { describe, expect, it } from "vitest";
import { memoryCard, memoryInputSchema, runMemoryTool } from "./memory.js";

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
