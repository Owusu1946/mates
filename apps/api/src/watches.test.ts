import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ results: [] as unknown[][], executes: [] as (unknown[] | Error)[], writes: [] as string[] }));
const ext = vi.hoisted(() => ({
  search: vi.fn(async () => [] as { url: string; title: string; published: string | null; excerpts: string[] }[]),
  push: vi.fn(async () => true),
  publish: vi.fn(async () => {}),
  composio: { create: vi.fn(async () => ({ triggerId: "ti_1" })), delete: vi.fn(async () => ({})), enable: vi.fn(async () => ({})), disable: vi.fn(async () => ({})), parse: vi.fn() },
  usageLeft: true,
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
  // History lines are written with a .catch() and never read back; they don't use up a queued result.
  self.catch = () => Promise.resolve([]);
  self.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => take().then(resolve, reject);
  return self;
};

vi.mock("./db/client.js", () => ({
  getDb: () => ({
    select: () => chain(),
    insert: () => chain(),
    update: () => chain(),
    execute: async () => {
      const next = db.executes.shift() ?? [];
      if (next instanceof Error) throw next;
      return { rows: next };
    },
  }),
}));
vi.mock("./web-search.js", () => ({ searchExcerpts: ext.search, webSearchConfigured: () => true }));
vi.mock("./delivery.js", () => ({ pushToUser: ext.push }));
vi.mock("./durable-runs.js", () => ({ publishOutbox: ext.publish, workerConfigured: () => true }));
vi.mock("./scheduling.js", () => ({ routineChat: async () => "mate_chat_1" }));
vi.mock("./usage/gate.js", () => ({
  assertUsage: async () => null,
  hasUsageLeft: async () => ext.usageLeft,
  UsageLimitError: class extends Error {},
}));
vi.mock("./integrations.js", () => ({ getComposio: () => ({ triggers: ext.composio }) }));

const { checkInterval, controlWatch, createWatch, everyText, firePrompt, fireWatch, handleWatchEvent, runWatchTool, shouldFire, watchCard, WatchError } = await import("./watches.js");

const model = (content: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { cost: 0.0004 } }));
const fetchMock = vi.fn();
const btc = { title: "BTC drops 5%", kind: "web" as const, condition: "Bitcoin falls 5% from today's price", action: "Email me at k@x.com", check_every_hours: null, app: null };
const context = { chatId: "mate_chat_1", mateId: null, request: "watch for a 5% drop in BTC and email me", timezone: "Africa/Accra" };
const row = (extra: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-0000000000a1", clerkUserId: "user_1", chatId: "mate_chat_1", mateId: null, title: "BTC drops 5%", kind: "web", condition: btc.condition, action: btc.action, request: context.request,
  status: "active", intervalMinutes: 240, nextCheckAt: null, lastCheckedAt: null, queries: ["bitcoin price"], baseline: "BTC $96,400", lastNote: "BTC $95,900", checks: 3, firedAt: null,
  expiresAt: new Date("2026-12-13T00:00:00Z"), warnedAt: null, trigger: null, pendingFire: null, timezone: "Africa/Accra", version: 2, createdAt: new Date(), updatedAt: new Date(), ...extra,
});

beforeEach(() => {
  db.results = [];
  db.executes = [];
  db.writes = [];
  ext.usageLeft = true;
  ext.search.mockReset().mockResolvedValue([{ url: "https://coin.example/btc", title: "Bitcoin price", published: "2026-11-13", excerpts: ["Bitcoin trades at $96,400"] }]);
  ext.push.mockClear();
  ext.publish.mockClear();
  for (const fn of Object.values(ext.composio)) fn.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("watch rules", () => {
  it("checks as asked, never faster than the plan allows, at least daily", () => {
    expect(checkInterval(240, null)).toBe(240);
    expect(checkInterval(240, 1)).toBe(240);
    expect(checkInterval(60, 6)).toBe(360);
    expect(checkInterval(60, 48)).toBe(1440);
    expect(everyText(240)).toBe("every 4 hours");
    expect(everyText(60)).toBe("every hour");
  });

  it("fires only when met, confident, and backed by a quote", () => {
    const quote = [{ url: "https://x", quote: "Bitcoin fell to $91,000" }];
    expect(shouldFire({ met: true, confidence: 0.9 }, quote)).toBe(true);
    expect(shouldFire({ met: true, confidence: 0.5 }, quote)).toBe(false);
    expect(shouldFire({ met: true, confidence: 0.9 }, [])).toBe(false);
    expect(shouldFire({ met: false, confidence: 0.99 }, quote)).toBe(false);
  });

  it("asks the run for exactly the approved action, with the evidence", () => {
    const prompt = firePrompt({ title: "BTC drops 5%", action: "Email me at k@x.com", request: "watch BTC" }, "BTC $91,000, down 5.6%", [{ url: "https://coin.example/btc", quote: "Bitcoin fell to $91,000" }]);
    expect(prompt).toContain("Do this now, as they asked: Email me at k@x.com");
    expect(prompt).toContain("https://coin.example/btc");
    expect(prompt).toContain("Don't take any other external action");
  });
});

describe("setting up a watch", () => {
  it("is for Plus and up", async () => {
    db.results = [[{ plan: "starter" }]];
    await expect(createWatch("user_1", btc, context)).rejects.toMatchObject({ code: "PLAN" });
    db.results = [[{ plan: "starter" }]];
    expect((await runWatchTool("user_1", btc, context)).result).toMatchObject({ upgrade: true });
  });

  it("stops at the plan's number of watches", async () => {
    db.results = [[{ plan: "plus" }], [{ active: 5 }]];
    await expect(createWatch("user_1", btc, context)).rejects.toBeInstanceOf(WatchError);
  });

  it("records a baseline from a first check and checks at the plan's pace", async () => {
    db.results = [[{ plan: "plus" }], [{ active: 0 }], [row({ checks: 1 })]];
    fetchMock
      .mockResolvedValueOnce(model({ objective: "Current bitcoin price", queries: ["bitcoin price today"] }))
      .mockResolvedValueOnce(model({ met: false, confidence: 0.9, note: "BTC $96,400", baseline: "BTC $96,400 at setup", evidence: [{ source: 1, quote: "Bitcoin trades at $96,400" }] }));
    const created = await createWatch("user_1", btc, context);
    expect(created).toHaveProperty("watch");
    const saved = db.writes.find((w) => w.includes("intervalMinutes"))!;
    expect(saved).toContain('"intervalMinutes":240');
    expect(saved).toContain("BTC $96,400 at setup");
    expect(saved).toContain('"queries":["bitcoin price today"]');
  });

  it("says so instead of watching when the condition is already true", async () => {
    db.results = [[{ plan: "pro" }], [{ active: 0 }]];
    fetchMock
      .mockResolvedValueOnce(model({ objective: "x", queries: ["bitcoin price"] }))
      .mockResolvedValueOnce(model({ met: true, confidence: 0.95, note: "Already down 6%", baseline: "x", evidence: [{ source: 1, quote: "Bitcoin trades at $96,400" }] }));
    expect(await createWatch("user_1", btc, context)).toMatchObject({ alreadyMet: true, note: "Already down 6%" });
    expect(db.writes.some((w) => w.includes("intervalMinutes"))).toBe(false);
  });

  it("starts a Composio trigger for an app watch", async () => {
    db.results = [[{ plan: "plus" }], [{ active: 1 }], [row({ kind: "app", trigger: { toolkit: "gmail", slug: "GMAIL_NEW_GMAIL_MESSAGE", triggerId: "ti_1", config: {} } })]];
    const created = await createWatch("user_1", { ...btc, kind: "app", app: { toolkit: "gmail", trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE", trigger_config: { query: "from:ama@x.com" } } }, context);
    expect(ext.composio.create).toHaveBeenCalledWith("user_1", "GMAIL_NEW_GMAIL_MESSAGE", { triggerConfig: { query: "from:ama@x.com" } });
    expect(created).toHaveProperty("watch");
  });
});

describe("firing", () => {
  it("starts one run and pushes, and deletes an app watch's trigger", async () => {
    db.executes = [[{ delegation_id: "run" }]];
    const result = await fireWatch(row({ trigger: { toolkit: "gmail", slug: "S", triggerId: "ti_9", config: {} } }) as never, "BTC $91,000", [{ url: null, quote: "q" }]);
    expect(result).toMatchObject({ fired: true });
    expect(ext.push).toHaveBeenCalledTimes(1);
    expect(ext.composio.delete).toHaveBeenCalledWith("ti_9");
    expect(ext.publish).toHaveBeenCalledTimes(1);
  });

  it("does nothing when it already fired (the claim found no active watch)", async () => {
    db.executes = [[]];
    expect(await fireWatch(row() as never, "n", [])).toEqual({ fired: false });
    expect(ext.push).not.toHaveBeenCalled();
  });

  it("waits for a busy chat instead of losing the firing", async () => {
    db.executes = [Object.assign(new Error("duplicate"), { code: "23505" })];
    expect(await fireWatch(row() as never, "BTC $91,000", [])).toEqual({ fired: false, pending: true });
    expect(db.writes.some((w) => w.includes("pendingFire") && w.includes("BTC $91,000"))).toBe(true);
    expect(ext.push).not.toHaveBeenCalled();
  });
});

describe("app events", () => {
  it("judges an event once, and fires when it meets the condition", async () => {
    const watch = row({ kind: "app", condition: "Ama emails about the contract", trigger: { toolkit: "gmail", slug: "S", triggerId: "ti_1", config: {} } });
    db.results = [[watch], [{ id: 1 }]];
    db.executes = [[{ delegation_id: "run" }]];
    fetchMock.mockResolvedValueOnce(model({ met: true, confidence: 0.9, note: "Ama sent the signed contract", baseline: "none", evidence: [{ source: 1, quote: "Subject: Signed contract" }] }));
    expect(await handleWatchEvent({ triggerId: "ti_1", eventId: "evt_1", slug: "GMAIL_NEW_GMAIL_MESSAGE", payload: { subject: "Signed contract" } })).toEqual({ handled: true, fired: true });
    db.results = [[watch], []];
    expect(await handleWatchEvent({ triggerId: "ti_1", eventId: "evt_1", slug: "GMAIL_NEW_GMAIL_MESSAGE", payload: {} })).toEqual({ handled: false });
  });
});

describe("the user's controls", () => {
  it("pauses and cancels with the right version, switching or deleting the trigger", async () => {
    const watch = row({ kind: "app", trigger: { toolkit: "gmail", slug: "S", triggerId: "ti_1", config: {} } });
    db.results = [[watch], [{ ...watch, status: "paused", version: 3 }]];
    expect(await controlWatch("user_1", watch.id, "pause", 2)).toMatchObject({ status: "paused" });
    expect(ext.composio.disable).toHaveBeenCalledWith("ti_1");
    db.results = [[watch]];
    expect(await controlWatch("user_1", watch.id, "pause", 1)).toBeNull();
    db.results = [[watch], [{ ...watch, status: "cancelled" }]];
    await controlWatch("user_1", watch.id, "cancel", 2);
    expect(ext.composio.delete).toHaveBeenCalledWith("ti_1");
  });

  it("keeps watching for another 30 days on renew", async () => {
    const watch = row({ status: "expired" });
    db.results = [[watch], [{ ...watch, status: "active" }]];
    await controlWatch("user_1", watch.id, "renew", 2);
    expect(db.writes.some((w) => w.includes('"status":"active"') && w.includes("expiresAt") && w.includes('"warnedAt":null'))).toBe(true);
  });

  it("shows the card with how often it's checked", () => {
    expect(watchCard(row() as never).watch).toMatchObject({ status: "active", every: "every 4 hours", lastNote: "BTC $95,900" });
  });
});
