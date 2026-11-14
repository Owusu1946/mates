import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ results: [] as unknown[][], executes: [] as unknown[][], writes: [] as string[] }));
const mocks = vi.hoisted(() => ({ apply: vi.fn(async () => ({ applied: true, plan: "starter", source: "revenuecat", recheckAt: null })), record: vi.fn(async () => {}) }));

// Every query builder method returns the chain; awaiting it (or .returning()) takes the next queued result.
const chain = (): Record<string, unknown> => {
  const take = () => Promise.resolve(db.results.shift() ?? []);
  const self: Record<string, unknown> = {};
  for (const name of ["select", "from", "where", "limit", "insert", "values", "update", "set", "onConflictDoNothing"])
    self[name] = (...args: unknown[]) => {
      if (name === "set" || name === "values") db.writes.push(JSON.stringify(args[0], (_k, v) => (typeof v === "object" && v && "queryChunks" in v ? "[sql]" : v)));
      return self;
    };
  self.returning = take;
  self.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => take().then(resolve, reject);
  return self;
};
vi.mock("../db/client.js", () => ({
  getDb: () => ({ select: () => chain(), insert: () => chain(), update: () => chain(), execute: async () => ({ rows: db.executes.shift() ?? [] }) }),
}));
vi.mock("./grants.js", () => ({ applyStoreGrant: mocks.apply, expireGrants: async () => 0 }));
vi.mock("./billing.js", async (importOriginal) => ({ ...(await importOriginal<typeof import("./billing.js")>()), recordPeriod: mocks.record }));

const { eventPeriod, eventUsers, processBillingEvent, productPlan, revenueCatAuthorized, storeEvent, subscriberState, syncFromRevenueCat } = await import("./revenuecat.js");
const { createApp } = await import("../app.js");

const NOW = Date.parse("2026-11-14T12:00:00Z");
const customer = (subscriptions: Record<string, object>, entitlements: Record<string, object> = {}) => ({ request_date_ms: NOW, subscriber: { subscriptions, entitlements } });
const sub = (extra: object = {}) => ({ expires_date: "2026-12-14T12:00:00Z", is_sandbox: false, store: "app_store", ...extra });
const event = (extra: object = {}) => ({ id: "evt_1", type: "INITIAL_PURCHASE", environment: "PRODUCTION" as const, app_user_id: "user_1", product_id: "mates_pro_monthly", transaction_id: "tx_1", price: 40, commission_percentage: 0.15, tax_percentage: 0.05, purchased_at_ms: NOW, expiration_at_ms: Date.parse("2026-12-14T12:00:00Z"), ...extra });

beforeEach(() => {
  process.env.REVENUECAT_SECRET_KEY = "secret";
  process.env.REVENUECAT_WEBHOOK_AUTH = "webhook";
  delete process.env.REVENUECAT_ALLOW_SANDBOX;
  db.results = [];
  db.executes = [];
  db.writes = [];
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("which plan a product is", () => {
  it("knows the app's products, the Test Store's annual id and promotional grants", () => {
    expect(productPlan("mates_pro_monthly")).toBe("pro");
    expect(productPlan("mates_max_yearly")).toBe("max");
    expect(productPlan("mates_starter_annual")).toBe("starter");
    expect(productPlan("rc_promo_plus_monthly")).toBe("plus");
    expect(productPlan("something_else")).toBeNull();
    expect(productPlan(null)).toBeNull();
  });
});

describe("a customer's store state", () => {
  it("picks the best active subscription and keeps RevenueCat's time for ordering", () => {
    const state = subscriberState(customer({ mates_starter_monthly: sub(), mates_pro_yearly: sub({ expires_date: "2027-11-14T12:00:00Z" }) }), false, NOW);
    expect(state).toMatchObject({ plan: "pro", productId: "mates_pro_yearly", environment: "production", store: "app_store" });
    expect(state.expiresAt?.toISOString()).toBe("2027-11-14T12:00:00.000Z");
    expect(state.syncedAt.getTime()).toBe(NOW);
  });

  it("never lets a sandbox receipt grant access on production, but allows it on staging", () => {
    expect(subscriberState(customer({ mates_max_monthly: sub({ is_sandbox: true }) }), false, NOW).plan).toBeNull();
    expect(subscriberState(customer({ mates_max_monthly: sub({ is_sandbox: true }) }), true, NOW)).toMatchObject({ plan: "max", environment: "sandbox" });
  });

  it("a sandbox receipt doesn't hide a real subscription", () => {
    expect(subscriberState(customer({ mates_max_monthly: sub({ is_sandbox: true }), mates_plus_monthly: sub() }), false, NOW).plan).toBe("plus");
  });

  it("ignores lapsed and refunded subscriptions, and counts a billing grace period", () => {
    expect(subscriberState(customer({ mates_pro_monthly: sub({ expires_date: "2026-11-01T00:00:00Z" }) }), false, NOW).plan).toBeNull();
    expect(subscriberState(customer({ mates_pro_monthly: sub({ refunded_at: "2026-11-10T00:00:00Z" }) }), false, NOW).plan).toBeNull();
    expect(subscriberState(customer({ mates_pro_monthly: sub({ expires_date: "2026-11-01T00:00:00Z", grace_period_expires_date: "2026-11-20T00:00:00Z" }) }), false, NOW).plan).toBe("pro");
  });

  it("counts a promotional grant from the dashboard, with or without a receipt", () => {
    expect(subscriberState(customer({}, { plus: { product_identifier: "rc_promo_plus_monthly", expires_date: "2026-12-01T00:00:00Z" } }), false, NOW)).toMatchObject({ plan: "plus", store: "promotional" });
    expect(subscriberState(customer({ rc_promo_pro_lifetime: sub({ expires_date: null, store: "promotional" }) }), false, NOW)).toMatchObject({ plan: "pro", expiresAt: null });
  });

  it("an unknown product neither grants nor throws", () => {
    expect(subscriberState(customer({ mystery_product: sub() }), false, NOW).plan).toBeNull();
  });

  it("no subscription at all means no store plan (the other grants decide), never 'none'", () => {
    expect(subscriberState(customer({}), false, NOW).plan).toBeNull();
  });
});

describe("syncing from RevenueCat", () => {
  it("applies the state as a store grant", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(customer({ mates_pro_monthly: sub({ expires_date: "2099-01-01T00:00:00Z" }) }))));
    await syncFromRevenueCat("user_1");
    expect(mocks.apply).toHaveBeenCalledWith("user_1", expect.objectContaining({ plan: "pro", syncedAt: new Date(NOW) }));
  });

  it("writes nothing when RevenueCat fails or answers badly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("down", { status: 503 })).mockResolvedValueOnce(Response.json({ subscriber: {} })));
    await expect(syncFromRevenueCat("user_1")).rejects.toThrow();
    await expect(syncFromRevenueCat("user_1")).rejects.toThrow();
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("says billing is unavailable without a key, before anything else", async () => {
    delete process.env.REVENUECAT_SECRET_KEY;
    await expect(syncFromRevenueCat("user_1")).rejects.toThrow("isn't configured");
  });
});

describe("webhook events", () => {
  it("accepts only the configured authorization", () => {
    expect(revenueCatAuthorized("webhook")).toBe(true);
    expect(revenueCatAuthorized("wrong")).toBe(false);
    expect(revenueCatAuthorized(undefined)).toBe(false);
    delete process.env.REVENUECAT_WEBHOOK_AUTH;
    expect(revenueCatAuthorized("webhook")).toBe(false);
  });

  it("names both sides of a transfer and ignores anonymous ids", () => {
    expect(eventUsers({ id: "e", type: "TRANSFER", transferred_from: ["user_old", "$RCAnonymousID:1"], transferred_to: ["user_new"] })).toEqual(["user_old", "user_new"]);
    expect(eventUsers({ id: "e", type: "RENEWAL", app_user_id: "user_1", aliases: ["user_1", "$RCAnonymousID:2"] })).toEqual(["user_1"]);
  });

  it("keeps a redelivered event once", async () => {
    db.results = [[]];
    expect(await storeEvent(event())).toEqual({ stored: false });
  });
});

describe("revenue from events", () => {
  it("records a purchase at its real price, fees from commission and tax, over its own period", () => {
    expect(eventPeriod(event())).toEqual({
      userId: "user_1",
      plan: "pro",
      period: { startsAt: new Date(NOW), endsAt: new Date("2026-12-14T12:00:00Z"), grossMicros: 40_000_000, storeFeeMicros: 8_000_000, externalId: "tx_1" },
    });
  });

  it("spans a yearly plan across the year", () => {
    const paid = eventPeriod(event({ product_id: "mates_max_yearly", price: 800, expiration_at_ms: Date.parse("2027-11-14T12:00:00Z") }));
    expect(paid?.period.endsAt.toISOString()).toBe("2027-11-14T12:00:00.000Z");
    expect(paid?.period.grossMicros).toBe(800_000_000);
  });

  it("records a refund as sent (already negative), under its own id beside the payment", () => {
    const refund = eventPeriod(event({ type: "CANCELLATION", price: -40 }));
    expect(refund?.period).toMatchObject({ grossMicros: -40_000_000, storeFeeMicros: -8_000_000, externalId: "refund_tx_1" });
  });

  it("records nothing for sandbox, non-paying events, or when fields are missing", () => {
    expect(eventPeriod(event({ environment: "SANDBOX" }))).toBeNull();
    expect(eventPeriod(event({ type: "CANCELLATION", price: 0 }))).toBeNull();
    expect(eventPeriod(event({ transaction_id: null }))).toBeNull();
    expect(eventPeriod(event({ product_id: "mystery" }))).toBeNull();
    expect(eventPeriod(event({ commission_percentage: null, tax_percentage: null }))?.period.storeFeeMicros).toBe(0);
  });
});

describe("processing a stored event", () => {
  const stored = (payload: object, extra: object = {}) => ({ id: "evt_1", status: "pending", attempts: 0, payload, ...extra });

  it("syncs everyone named, records the payment, and closes the event", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(customer({ mates_pro_monthly: sub({ expires_date: "2099-01-01T00:00:00Z" }) }))));
    db.results = [[stored(event())]];
    await processBillingEvent("evt_1");
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledWith("user_1", "pro", "revenuecat", expect.objectContaining({ externalId: "tx_1" }));
    expect(db.writes.at(-1)).toContain('"status":"done"');
  });

  it("closes a sandbox event on production without touching anyone", async () => {
    db.results = [[stored(event({ environment: "SANDBOX" }))]];
    await processBillingEvent("evt_1");
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(db.writes.at(-1)).toContain('"status":"done"');
  });

  it("marks it failed (for the dispatcher to retry) when RevenueCat can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    db.results = [[stored(event())]];
    await processBillingEvent("evt_1");
    expect(mocks.record).not.toHaveBeenCalled();
    expect(db.writes.at(-1)).toContain('"status":"failed"');
  });

  it("does nothing when another run already has it", async () => {
    db.results = [[]];
    await processBillingEvent("evt_1");
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});

describe("routes", () => {
  const app = createApp({ verifyToken: async () => ({ sub: "user_1" }) });
  const post = (authorization: string, body: string) => app.request("/webhooks/revenuecat", { method: "POST", headers: { authorization, "content-type": "application/json" }, body });

  it("rejects a bad authorization or payload", async () => {
    expect((await post("wrong", "{}")).status).toBe(401);
    expect((await post("webhook", "not json")).status).toBe(400);
    expect((await post("webhook", JSON.stringify({ event: { type: "TEST" } }))).status).toBe(400);
  });

  it("stores a valid event and answers at once", async () => {
    db.results = [[{ id: "evt_1" }], []];
    const response = await post("webhook", JSON.stringify({ event: event() }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, duplicate: false });
    expect(db.writes[0]).toContain('"id":"evt_1"');
  });

  it("needs a signed-in user for the sync, and says when billing isn't set up", async () => {
    expect((await app.request("/v1/billing/sync", { method: "POST" })).status).toBe(401);
    delete process.env.REVENUECAT_SECRET_KEY;
    const response = await app.request("/v1/billing/sync", { method: "POST", headers: { authorization: "Bearer token" } });
    expect(response.status).toBe(503);
  });
});
