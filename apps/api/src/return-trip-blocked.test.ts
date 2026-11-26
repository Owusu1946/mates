import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  results: [] as { rows: Record<string, unknown>[] }[],
  queries: [] as SQL[],
  pushes: [] as Record<string, unknown>[],
}));

vi.mock("./db/client.js", () => ({
  getDb: () => ({ execute: async (query: SQL) => {
    state.queries.push(query);
    return state.results.shift() ?? { rows: [] };
  } }),
}));
vi.mock("./delivery.js", () => ({
  pushReturnTripToUser: async (input: Record<string, unknown>) => {
    state.pushes.push(input);
    return true;
  },
}));

const { remindBlockedRuns } = await import("./return-trip-blocked.js");

beforeEach(() => {
  state.results = [];
  state.queries = [];
  state.pushes = [];
});

describe("blocked reminders", () => {
  it("enqueues one reminder for a claimed run and does not re-enqueue on the next tick", async () => {
    state.results = [
      { rows: [{ id: "run-1", userId: "user-1", chatId: "mate-1" }] },
      { rows: [] }, { rows: [] },
      { rows: [] }, { rows: [] }, { rows: [] },
    ];

    await remindBlockedRuns(new Date("2026-11-25T12:00:00Z"));
    await remindBlockedRuns(new Date("2026-11-25T12:01:00Z"));

    expect(state.pushes).toEqual([expect.objectContaining({
      sourceKey: "run:run-1:blocked-reminder",
      data: { chatId: "mate-1", delegationId: "run-1" },
    })]);
    const claim = new PgDialect().sqlToQuery(state.queries[0]!).sql;
    expect(claim).toContain("resumed.created_at > d.created_at");
    expect(claim).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("enqueues computer and mission reminders with distinct stable keys", async () => {
    state.results = [
      { rows: [] },
      { rows: [{ id: "goal-1", userId: "user-1", chatId: "mate-1", mateId: "mate-1", question: "Choose a file" }] },
      { rows: [{ id: "00000000-0000-4000-8000-000000000003", userId: "user-1", chatId: "group-1", round: 3, question: "Approve the plan" }] },
    ];

    await remindBlockedRuns(new Date("2026-11-25T12:00:00Z"));

    expect(state.pushes.map((push) => push.sourceKey)).toEqual([
      "computer:goal-1:blocked-reminder",
      "mission:00000000-0000-4000-8000-000000000003:blocked-reminder",
    ]);
    expect(state.pushes[1]).toMatchObject({ data: { chatId: "group-1", messageId: "mission_00000000-0000-4000-8000-000000000003_3" } });
  });
});
