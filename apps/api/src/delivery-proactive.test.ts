import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const db = vi.hoisted(() => ({
  selects: [] as unknown[][],
  inserts: [] as unknown[][],
  executes: [] as { status: string }[][],
  executed: [] as SQL[],
  writes: [] as Record<string, unknown>[],
}));

function query(kind: "select" | "insert" | "update") {
  const self: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy", "limit", "values", "onConflictDoNothing"]) {
    self[method] = () => self;
  }
  self.set = (values: Record<string, unknown>) => {
    db.writes.push(values);
    return self;
  };
  self.returning = () => Promise.resolve(kind === "insert" ? db.inserts.shift() ?? [] : []);
  self.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
    const result = kind === "select" ? db.selects.shift() ?? [] : [];
    return Promise.resolve(result).then(resolve, reject);
  };
  return self;
}

vi.mock("./db/client.js", () => ({
  getDb: () => ({
    select: () => query("select"),
    insert: () => query("insert"),
    update: () => query("update"),
    execute: async (statement: SQL) => {
      db.executed.push(statement);
      return { rows: db.executes.shift() ?? [] };
    },
  }),
}));

const { deliverPendingProactiveNotifications, pushProactiveToUser, pushReturnTripToUser } = await import("./delivery.js");

const mateId = "00000000-0000-4000-8000-000000000001";
const noticeId = "00000000-0000-4000-8000-000000000002";
const token = "ExpoPushToken[device_1]";
const normalSettings = { mode: "normal", quietStart: "22:00", quietEnd: "07:00" };
const notice = (extra: Record<string, unknown> = {}) => ({
  id: noticeId,
  clerkUserId: "user_1",
  mateId,
  sourceKey: "watch:watch_1:fire",
  title: "Watch update",
  body: "The price crossed your threshold.",
  data: { chatId: `mate_${mateId}` },
  urgent: false,
  status: "queued",
  nextAttemptAt: new Date("2026-11-25T12:00:00Z"),
  sentAt: null,
  createdAt: new Date("2026-11-25T12:00:00Z"),
  updatedAt: new Date("2026-11-25T12:00:00Z"),
  ...extra,
});

function dispatchReads(item = notice(), settings: Record<string, unknown> | null = null) {
  db.selects.push(
    [item],
    [{ id: mateId }],
    settings ? [settings] : [],
    [{ timezone: "Africa/Accra" }],
    [{ token }],
  );
}

function setProviderAccepted() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { status: "ok" } }), { status: 200 })));
}

beforeEach(() => {
  db.selects = [];
  db.inserts = [[{ id: noticeId }]];
  db.executes = [];
  db.executed = [];
  db.writes = [];
  setProviderAccepted();
});

afterEach(() => vi.unstubAllGlobals());

describe("proactive notification delivery", () => {
  it("persists a quiet-hours deferral and sends it when the next dispatcher tick reaches quiet-hours end", async () => {
    dispatchReads();
    const deferred = await pushProactiveToUser({
      userId: "user_1", mateId, sourceKey: "watch:watch_1:fire", title: "Watch update",
      body: "The price crossed your threshold.", data: { chatId: `mate_${mateId}` },
    }, new Date("2026-11-25T23:00:00Z"));

    expect(deferred).toBe(false);
    expect(db.writes).toContainEqual(expect.objectContaining({ status: "quiet", nextAttemptAt: new Date("2026-11-26T07:00:00Z") }));
    expect(fetch).not.toHaveBeenCalled();

    db.selects.push(
      [{ id: noticeId }],
      [notice({ status: "quiet", nextAttemptAt: new Date("2026-11-26T07:00:00Z") })],
      [{ id: mateId }],
      [],
      [{ timezone: "Africa/Accra" }],
      [{ token }],
      [{ token }],
    );
    db.executes = [[{ status: "sending" }]];
    const sent = await deliverPendingProactiveNotifications(new Date("2026-11-26T07:00:00Z"));

    expect(sent).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(db.writes).toContainEqual(expect.objectContaining({ status: "sent" }));
  });

  it("lets an explicitly urgent watch through quiet hours and budgets", async () => {
    dispatchReads(notice({ urgent: true }));
    db.selects.push([{ token }]);
    db.executes = [[{ status: "sending" }]];

    const sent = await pushProactiveToUser({
      userId: "user_1", mateId, sourceKey: "watch:watch_1:fire", title: "Watch update",
      body: "The price crossed your threshold.", data: { chatId: `mate_${mateId}` }, urgent: true,
    }, new Date("2026-11-25T23:00:00Z"));

    expect(sent).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("defers non-urgent items from an urgent-only mate to the morning brief", async () => {
    dispatchReads(notice(), { mode: "urgent_only", quietStart: "22:00", quietEnd: "07:00" });

    const sent = await pushProactiveToUser({
      userId: "user_1", mateId, sourceKey: "watch:watch_1:fire", title: "Watch update",
      body: "The price crossed your threshold.", data: { chatId: `mate_${mateId}` },
    }, new Date("2026-11-25T12:00:00Z"));

    expect(sent).toBe(false);
    expect(db.writes).toContainEqual(expect.objectContaining({ status: "brief" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("defers a budget-exhausted item to the morning brief without sending a second push", async () => {
    dispatchReads();
    db.executes = [[{ status: "brief" }]];

    const sent = await pushProactiveToUser({
      userId: "user_1", mateId, sourceKey: "watch:watch_1:fire", title: "Watch update",
      body: "The price crossed your threshold.", data: { chatId: `mate_${mateId}` },
    }, new Date("2026-11-25T12:00:00Z"));

    expect(sent).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("suppresses a budget-exhausted morning brief push instead of folding it into another brief", async () => {
    dispatchReads(notice({ data: { morningBriefId: noticeId, chatId: `mate_${mateId}` } }));
    db.executes = [[{ status: "suppressed" }]];

    const sent = await pushProactiveToUser({
      userId: "user_1", mateId, sourceKey: `morning-brief:${noticeId}`, title: "Your morning",
      body: "Today’s brief", data: { morningBriefId: noticeId, chatId: `mate_${mateId}` },
    }, new Date("2026-11-25T12:00:00Z"));

    expect(sent).toBe(false);
    expect(new PgDialect().sqlToQuery(db.executed[0]!).params).toContain("suppressed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a user-requested result without using the unprompted budget or the proactive Off mode", async () => {
    dispatchReads(notice({ sourceKey: "return-trip:code:run_1:done" }), { mode: "off", quietStart: "22:00", quietEnd: "07:00" });
    db.selects.push([{ token }]);
    db.executes = [[{ status: "sending" }]];

    const sent = await pushReturnTripToUser({
      userId: "user_1", mateId, chatId: `mate_${mateId}`, sourceKey: "code:run_1:done",
      title: "PR is ready", body: "Opened PR #12.", data: { chatId: `mate_${mateId}` },
    });

    const claim = new PgDialect().sqlToQuery(db.executed[0]!);
    expect(sent).toBe(true);
    expect(claim.params).toContain(true);
    expect(claim.sql).toContain("source_key NOT LIKE 'return-trip:%'");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue the same source twice", async () => {
    db.inserts = [[]];

    const sent = await pushProactiveToUser({
      userId: "user_1", mateId, sourceKey: "watch:watch_1:fire", title: "Watch update",
      body: "The price crossed your threshold.", data: { chatId: `mate_${mateId}` },
    });

    expect(sent).toBe(false);
    expect(db.selects).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
