import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ results: [] as unknown[][], writes: [] as string[], batches: 0 }));
const ext = vi.hoisted(() => ({
  learning: { habits: true, apps: false, prep: true, plan: "plus" },
  doneToday: false,
  push: vi.fn(async () => true),
  submitRun: vi.fn(async () => ({ id: "run_1", createdAt: new Date() })),
  scheduleRoutine: vi.fn(async () => ({ id: "routine_1" })),
  record: vi.fn(async () => {}),
}));

// Every query builder method returns the chain; awaiting it (or .returning()) takes the next queued result.
const chain = (): Record<string, unknown> => {
  const take = () => Promise.resolve(db.results.shift() ?? []);
  const self: Record<string, unknown> = {};
  for (const name of ["select", "from", "where", "orderBy", "limit", "insert", "values", "update", "set", "onConflictDoNothing"])
    self[name] = (...args: unknown[]) => {
      if (name === "set" || name === "values") db.writes.push(JSON.stringify(args[0], (_k, v) => (typeof v === "object" && v && "queryChunks" in v ? "[sql]" : v)));
      return self;
    };
  self.returning = take;
  self.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => take().then(resolve, reject);
  return self;
};

vi.mock("../db/client.js", () => ({
  getDb: () => ({
    select: () => chain(),
    insert: () => chain(),
    update: () => chain(),
    batch: async () => {
      db.batches++;
      return [];
    },
  }),
}));
vi.mock("./shared.js", () => ({ learningFor: async () => ext.learning }));
vi.mock("./activity.js", () => ({ doneToday: async () => ext.doneToday, recordActivity: ext.record }));
vi.mock("../delivery.js", () => ({ pushToUser: ext.push }));
vi.mock("../durable-runs.js", () => ({ submitRun: ext.submitRun }));
vi.mock("../scheduling.js", () => ({ routineChat: async () => "mate_m1", scheduleRoutine: ext.scheduleRoutine }));
vi.mock("../mates.js", () => ({ mateChatId: (id: string) => `mate_${id}` }));
vi.mock("./miner.js", () => ({ nextDue: () => new Date("2026-11-16T08:55:00Z"), whenText: () => "Mondays around 08:55" }));

const { dispatchNudges, nudgeAction, nudgeCard, sendNudge, HabitError } = await import("./nudges.js");

const habit = (extra: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-0000000000h1",
  clerkUserId: "user_1",
  mateId: "m1",
  taskKey: "plan_week",
  title: "Plans the week on Monday mornings",
  description: "Asks for a plan of the week.",
  line: "You usually plan your week around now. Want me to handle it?",
  actionPrompt: "Plan my week.",
  trigger: { type: "time" as const, dows: [1], hour: 8, minute: 55, tz: "Africa/Accra" },
  evidence: { count: 5, weeks: 5, dates: [] },
  confidence: 0.9,
  status: "candidate" as const,
  nextDueAt: new Date("2026-11-16T08:55:00Z"),
  lastNudgedAt: null,
  lastSeenAt: new Date(),
  accepted: 0,
  skipped: 0,
  automatic: false,
  routineId: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...extra,
});
const device = { quietStart: 22, quietEnd: 7, timezone: "Africa/Accra" };
const monday = new Date("2026-11-16T08:52:00Z");

beforeEach(() => {
  db.results = [];
  db.writes = [];
  db.batches = 0;
  ext.learning = { habits: true, apps: false, prep: true, plan: "plus" };
  ext.doneToday = false;
  vi.clearAllMocks();
});

describe("sending a nudge", () => {
  it("posts the offer in the mate's chat and pushes it", async () => {
    // device, nudges today, chat busy, chat head, chat title
    db.results = [[device], [{ count: 0 }], [], [{ id: "msg_9" }], [{ title: "Nova" }]];
    const sent = await sendNudge(habit(), monday);
    expect(sent).toMatchObject({ sent: true, chatId: "mate_m1" });
    expect(db.batches).toBe(1);
    expect(db.writes[0]).toContain("You usually plan your week around now");
    expect(db.writes[0]).toContain('"kind":"nudge"');
    expect(ext.push).toHaveBeenCalledWith("user_1", expect.objectContaining({ title: "Nova", data: { chatId: "mate_m1", chatKind: "mate" } }));
  });

  it("doesn't when learning is off", async () => {
    ext.learning = { ...ext.learning, habits: false };
    expect(await sendNudge(habit(), monday)).toEqual({ sent: false, reason: "learning_off" });
  });

  it("doesn't when the task was already done today", async () => {
    ext.doneToday = true;
    expect(await sendNudge(habit(), monday)).toEqual({ sent: false, reason: "done_today" });
  });

  it("doesn't in quiet hours", async () => {
    db.results = [[device]];
    expect(await sendNudge(habit(), new Date("2026-11-16T23:00:00Z"))).toEqual({ sent: false, reason: "quiet" });
  });

  it("stops at two a day", async () => {
    db.results = [[device], [{ count: 2 }]];
    expect(await sendNudge(habit(), monday)).toEqual({ sent: false, reason: "daily_limit" });
    expect(ext.push).not.toHaveBeenCalled();
  });

  it("waits when the chat is mid-run", async () => {
    db.results = [[device], [{ count: 0 }], [{ id: "run_x" }]];
    expect(await sendNudge(habit(), monday)).toEqual({ sent: false, reason: "busy" });
  });
});

describe("the dispatcher", () => {
  it("moves a habit on without offering it when it's too unsure", async () => {
    db.results = [[habit({ confidence: 0.5 })], [habit()]];
    await dispatchNudges(monday);
    expect(db.writes[0]).toContain("2026-11-16T08:55:00.000Z");
    expect(ext.push).not.toHaveBeenCalled();
  });

  it("lets a time that passed over an hour ago go", async () => {
    const stale = habit({ status: "confirmed", nextDueAt: new Date("2026-11-16T06:00:00Z") });
    db.results = [[stale], [stale]];
    await dispatchNudges(monday);
    expect(ext.push).not.toHaveBeenCalled();
  });

  it("doesn't offer it when another tick claimed it first", async () => {
    db.results = [[habit({ status: "confirmed" })], []];
    await dispatchNudges(monday);
    expect(ext.push).not.toHaveBeenCalled();
  });
});

describe("the nudge buttons", () => {
  const nudge = (extra: Record<string, unknown> = {}) => ({ id: "00000000-0000-4000-8000-0000000000n1", habitId: habit().id, clerkUserId: "user_1", chatId: "mate_m1", messageId: "nudge_n1", sentAt: new Date(), outcome: null, ...extra });
  const message = [{ message: { id: "nudge_n1", content: [{ type: "text", text: "line" }, { type: "tool-call", result: {} }] } }];

  it("Handle it runs the task in the mate's chat and confirms the habit", async () => {
    // nudge, habit, chat head, updated habit, (outcome write), card message
    db.results = [[nudge()], [habit()], [], [habit({ status: "confirmed", accepted: 1 })], [], message];
    const result = await nudgeAction("user_1", nudge().id, "handle");
    expect(result).toMatchObject({ outcome: "handled", runId: "run_1", chatId: "mate_m1" });
    expect(ext.submitRun).toHaveBeenCalledWith("user_1", expect.objectContaining({ chatId: "mate_m1", requestKey: `habit_${nudge().id}` }));
    expect(ext.record).toHaveBeenCalledWith([expect.objectContaining({ taskKey: "plan_week", kind: "ask" })]);
    expect(db.writes.some((w) => w.includes('"status":"confirmed"'))).toBe(true);
    expect(db.writes.some((w) => w.includes('"outcome":"handled"'))).toBe(true);
  });

  it("Stop suggesting dismisses it for good", async () => {
    db.results = [[nudge()], [habit()], [habit({ status: "dismissed" })], [], message];
    expect(await nudgeAction("user_1", nudge().id, "stop")).toMatchObject({ outcome: "stopped" });
    expect(db.writes.some((w) => w.includes('"status":"dismissed"'))).toBe(true);
    expect(ext.submitRun).not.toHaveBeenCalled();
  });

  it("Make it automatic turns it into a routine for each weekday", async () => {
    const often = habit({ status: "confirmed", accepted: 3, trigger: { type: "time", dows: [1, 4], hour: 8, minute: 55, tz: "Africa/Accra" } });
    db.results = [[nudge({ outcome: "handled" })], [often], [], [often], [], message];
    const result = await nudgeAction("user_1", nudge().id, "automate");
    expect(result).toMatchObject({ outcome: "automated", routineIds: ["routine_1", "routine_1"] });
    expect(ext.scheduleRoutine).toHaveBeenCalledWith("user_1", expect.objectContaining({ frequency: "weekly", weekday: 1, time: "08:55", prompt: "Plan my week." }), "mate_m1", expect.any(String));
    expect(db.writes.some((w) => w.includes('"automatic":true'))).toBe(true);
  });

  it("won't automate before it's been handled a few times", async () => {
    db.results = [[nudge()], [habit()]];
    await expect(nudgeAction("user_1", nudge().id, "automate")).rejects.toThrow(HabitError);
  });

  it("answers a nudge once", async () => {
    db.results = [[nudge({ outcome: "skipped" })], [habit()]];
    await expect(nudgeAction("user_1", nudge().id, "handle")).rejects.toThrow("ALREADY_ANSWERED");
  });

  it("someone else's nudge isn't found", async () => {
    db.results = [[]];
    await expect(nudgeAction("user_2", nudge().id, "handle")).rejects.toThrow("NOT_FOUND");
  });

  it("offers Make it automatic on the card once it's been handled twice", () => {
    expect(nudgeCard(habit({ accepted: 1 }), "n").nudge!.canAutomate).toBe(false);
    expect(nudgeCard(habit({ accepted: 2 }), "n").nudge!.canAutomate).toBe(true);
  });
});
