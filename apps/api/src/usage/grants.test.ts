import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ results: [] as unknown[][], writes: [] as string[], deletes: 0 }));

// Every query builder method returns the chain; awaiting it (or .returning()) takes the next queued result.
const chain = (): Record<string, unknown> => {
  const take = () => Promise.resolve(db.results.shift() ?? []);
  const self: Record<string, unknown> = {};
  for (const name of ["select", "from", "where", "limit", "insert", "values", "update", "set", "onConflictDoUpdate", "onConflictDoNothing"])
    self[name] = (...args: unknown[]) => {
      if (name === "set" || name === "values") db.writes.push(JSON.stringify(args[0], (_k, v) => (typeof v === "object" && v && "queryChunks" in v ? "[sql]" : v)));
      if (name === "onConflictDoUpdate") db.writes.push(JSON.stringify((args[0] as { set: unknown }).set, (_k, v) => (typeof v === "object" && v && "queryChunks" in v ? "[sql]" : v)));
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
    delete: () => {
      db.deletes++;
      return chain();
    },
  }),
}));

const { applyStoreGrant, effectivePlan, expireGrants } = await import("./grants.js");
const { setPlan } = await import("./billing.js");

const now = new Date("2026-11-14T12:00:00Z");
const day = 86_400_000;
const at = (days: number) => new Date(now.getTime() + days * day);

beforeEach(() => {
  db.results = [];
  db.writes = [];
  db.deletes = 0;
});

describe("the plan in force", () => {
  it("is the best active grant", () => {
    expect(effectivePlan([{ kind: "manual", plan: "starter", expiresAt: null }, { kind: "revenuecat", plan: "pro", expiresAt: at(20) }], now)).toMatchObject({ plan: "pro", source: "revenuecat" });
  });

  it("falls back to the server default (null), never 'none', when nothing is active", () => {
    expect(effectivePlan([], now)).toEqual({ plan: null, source: null, recheckAt: null });
    expect(effectivePlan([{ kind: "revenuecat", plan: "pro", expiresAt: at(-1) }], now).plan).toBeNull();
    expect(effectivePlan([{ kind: "manual", plan: "none", expiresAt: null }], now).plan).toBeNull();
  });

  it("follows someone through the grace period, a purchase, a cancellation and the cutoff", () => {
    const grandfather = { kind: "grandfather" as const, plan: "starter" as const, expiresAt: at(30) };
    // Grace period only.
    expect(effectivePlan([grandfather], now)).toMatchObject({ plan: "starter", source: "grandfather" });
    // Buys Pro for a month: Pro wins, and the plan is checked again when Pro lapses.
    const pro = { kind: "revenuecat" as const, plan: "pro" as const, expiresAt: at(10) };
    expect(effectivePlan([grandfather, pro], now)).toMatchObject({ plan: "pro", recheckAt: at(10) });
    // Cancels; Pro runs out: back to the grace period's Starter, not to nothing.
    expect(effectivePlan([grandfather, pro], at(11))).toMatchObject({ plan: "starter", source: "grandfather" });
    // After the cutoff: the server default.
    expect(effectivePlan([grandfather, pro], at(31)).plan).toBeNull();
  });
});

describe("store grants from a sync", () => {
  const state = (syncedAt: Date, plan: "pro" | null = "pro") => ({ plan, expiresAt: at(30), environment: "production" as const, productId: "mates_pro_monthly", store: "app_store", syncedAt });

  it("an older RevenueCat state never overwrites a newer one", async () => {
    db.results = [[{ syncedAt: at(0) }]];
    expect(await applyStoreGrant("user_1", state(at(-1)))).toEqual({ applied: false });
    expect(db.writes).toHaveLength(0);
  });

  it("a newer state is written, guarded again in the write itself", async () => {
    db.results = [[{ syncedAt: at(-1) }], [], [{ kind: "revenuecat", plan: "pro", expiresAt: at(30) }], []];
    const result = await applyStoreGrant("user_1", state(at(0)));
    expect(result).toMatchObject({ applied: true, plan: "pro", source: "revenuecat" });
    expect(db.writes.some((w) => w.includes('"plan":"pro"') && w.includes('"syncedAt"'))).toBe(true);
  });

  it("no active subscription removes only the store grant; the others decide", async () => {
    db.results = [[], [], [{ kind: "manual", plan: "plus", expiresAt: null }], []];
    const result = await applyStoreGrant("user_1", state(at(0), null));
    expect(db.deletes).toBe(1);
    expect(result).toMatchObject({ applied: true, plan: "plus", source: "manual" });
    expect(db.writes.join()).not.toContain('"plan":"none"');
  });
});

describe("setting a plan by hand", () => {
  it("is a manual grant beside any subscription", async () => {
    db.results = [[], [{ kind: "manual", plan: "max", expiresAt: null }], []];
    await setPlan("user_1", "max");
    expect(db.writes[0]).toContain('"kind":"manual"');
    expect(db.writes.some((w) => w.includes('"plan":"max"') && w.includes('"planSource":"manual"'))).toBe(true);
  });

  it("'none' takes the manual grant away rather than writing 'none'", async () => {
    db.results = [[], [], []];
    await setPlan("user_1", "none");
    expect(db.deletes).toBe(1);
    expect(db.writes.join()).not.toContain('"plan":"none"');
  });

  it("still records a payment when asked", async () => {
    db.results = [[], [{ kind: "manual", plan: "pro", expiresAt: null }], [], []];
    await setPlan("user_1", "pro", { period: { grossMicros: 40_000_000 } });
    expect(db.writes.some((w) => w.includes('"grossMicros":40000000'))).toBe(true);
  });
});

describe("lapsed grants", () => {
  it("re-work out the plan for profiles whose grant has run out", async () => {
    db.results = [[{ userId: "user_1" }, { userId: "user_2" }], [], [], [], []];
    expect(await expireGrants(now)).toBe(2);
  });
});
