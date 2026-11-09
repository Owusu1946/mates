import { beforeEach, describe, expect, it, vi } from "vitest";

// Each test sets the chat row the database "returns" for the routine's chat.
let chatRows: { kind: string }[] = [];
vi.mock("./db/client.js", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: async () => chatRows }) }) }),
}));
vi.mock("./mates.js", async (original) => ({
  ...(await original<typeof import("./mates.js")>()),
  ensureDefaultMate: vi.fn(async () => ({ id: "lead-mate" })),
}));

const { routineChat, routineMessage, scheduledPrompt, scheduleInstructions } = await import("./scheduling.js");

const spec = { title: "Morning stock report", prompt: "Write a report on the GSE and draft an email about it to Ama", frequency: "daily" as const, timezone: "Africa/Accra", time: "08:00", weekday: null, onceAt: null };

describe("routines run with the mate who was asked", () => {
  beforeEach(() => {
    chatRows = [];
  });

  it("runs in the mate's own chat, or the group it was set up in", async () => {
    chatRows = [{ kind: "mate" }];
    expect(await routineChat("user_1", "mate_abc")).toBe("mate_abc");
    chatRows = [{ kind: "group" }];
    expect(await routineChat("user_1", "group_xyz")).toBe("group_xyz");
  });

  it("falls back to the lead mate's chat for older or deleted chats", async () => {
    chatRows = [{ kind: "legacy" }];
    expect(await routineChat("user_1", "chat_old")).toBe("mate_lead-mate");
    chatRows = [];
    expect(await routineChat("user_1", "mate_deleted")).toBe("mate_lead-mate");
    expect(await routineChat("user_1", null)).toBe("mate_lead-mate");
  });

  it("marks the run's turn so the app shows a scheduled chip, not a message from the user", () => {
    const message = routineMessage("user_r1", { id: "routine-1", title: spec.title }, "Do it", new Date("2026-11-10T08:00:00Z"));
    expect(message).toMatchObject({ id: "user_r1", role: "user", metadata: { custom: { routine: { id: "routine-1", title: "Morning stock report" } } } });
  });
});

describe("no second confirmation", () => {
  it("treats the user's request as standing consent for what it describes, and only that", () => {
    const prompt = scheduledPrompt(spec, "every morning at 8 write the stock report and draft an email about it to Ama");
    expect(prompt).toContain("draft an email about it to Ama");
    expect(prompt).toContain("without asking for confirmation");
    expect(prompt).toContain("Do not take external actions it does not describe");
    expect(prompt).not.toMatch(/request approval for any external/i);
  });

  it("tells the model a routine is active when scheduled, never a draft to confirm", () => {
    expect(scheduleInstructions).toContain("active as soon as you call the tool");
    expect(scheduleInstructions).toContain("never ask them to confirm");
    expect(scheduleInstructions).not.toMatch(/explicit confirmation|per-run approval/);
  });
});
