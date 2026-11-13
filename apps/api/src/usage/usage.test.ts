import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  plan: null as string | null,
  windows: [] as { kind: string; resetsAt: Date; spentMicros: number }[],
  executed: [] as unknown[],
  failExecute: 0,
}));

vi.mock("../db/client.js", async () => {
  const schema = await import("../db/schema.js");
  return {
    getDb: () => ({
      select: () => ({
        from: (table: unknown) => ({
          where: async () => (table === schema.profiles ? (db.plan === undefined ? [] : [{ plan: db.plan }]) : db.windows),
        }),
      }),
      execute: async (query: unknown) => {
        if (db.failExecute > 0) {
          db.failExecute--;
          throw new Error("database unavailable");
        }
        db.executed.push(query);
        return { rows: [] };
      },
    }),
  };
});

const { createApp } = await import("../app.js");
const { assertUsage, evaluateUsage, limitMessage, untilText, usageCapMs, UsageLimitError } = await import("./gate.js");
const { defaultPlan, planSpec, resolvePlan } = await import("./plans.js");
const { perMinute, price } = await import("./prices.js");
const { meterStream, readUsage } = await import("./openrouter.js");
const { recordUsage, usdToMicros } = await import("./record.js");

const now = new Date("2026-11-13T12:00:00Z");
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);
const env = { ...process.env };

beforeEach(() => {
  db.plan = null;
  db.windows = [];
  db.executed = [];
  db.failExecute = 0;
});
afterEach(() => {
  process.env = { ...env };
  vi.useRealTimers();
});

describe("plans", () => {
  it("give Starter 40% of $8 a month as its weekly budget, a quarter of it per 5 hours", () => {
    const starter = planSpec("starter");
    expect(starter.budgets.week).toBe(738_462);
    expect(starter.budgets["5h"]).toBe(184_616);
    expect(planSpec("plus").budgets.week).toBe(starter.budgets.week! * 2);
    expect(planSpec("pro").budgets.week).toBe(starter.budgets.week! * 6);
  });

  it("leave Max with only a weekly limit", () => {
    expect(planSpec("max").budgets["5h"]).toBeNull();
    expect(planSpec("max").budgets.week).toBe(planSpec("starter").budgets.week! * 12);
  });

  it("put accounts without a plan on DEFAULT_PLAN, Starter unless set", () => {
    expect(resolvePlan(null)).toBe("starter");
    process.env.DEFAULT_PLAN = "none";
    expect(defaultPlan()).toBe("none");
    expect(resolvePlan(undefined)).toBe("none");
    expect(resolvePlan("pro")).toBe("pro");
    process.env.DEFAULT_PLAN = "gold";
    expect(defaultPlan()).toBe("starter");
  });

  it("take budget overrides from the environment", () => {
    process.env.USAGE_STARTER_WEEKLY_MICROS = "1000";
    process.env.USAGE_STARTER_SESSION_MICROS = "250";
    expect(planSpec("starter").budgets).toEqual({ week: 1000, "5h": 250 });
  });
});

describe("where someone stands", () => {
  it("counts a live window and treats an ended one as empty", () => {
    const state = evaluateUsage("starter", [
      { kind: "5h", resetsAt: hours(2), spentMicros: 92_308 },
      { kind: "week", resetsAt: hours(-1), spentMicros: 700_000 },
    ], now);
    expect(state.windows).toEqual([
      { kind: "5h", usedPct: 50, resetsAt: hours(2).toISOString() },
      { kind: "week", usedPct: 0, resetsAt: null },
    ]);
    expect(state.blocked).toBeNull();
    expect(state.remainingMicros).toBe(184_616 - 92_308);
  });

  it("blocks on whichever window is used up, the later reset when both are", () => {
    const fiveHour = evaluateUsage("starter", [{ kind: "5h", resetsAt: hours(3), spentMicros: 200_000 }], now);
    expect(fiveHour.blocked).toEqual({ reason: "5h", resetsAt: hours(3).toISOString() });
    const both = evaluateUsage("starter", [
      { kind: "5h", resetsAt: hours(3), spentMicros: 200_000 },
      { kind: "week", resetsAt: hours(50), spentMicros: 800_000 },
    ], now);
    expect(both.blocked).toEqual({ reason: "week", resetsAt: hours(50).toISOString() });
    expect(both.windows.map((w) => w.usedPct)).toEqual([100, 100]);
  });

  it("never blocks Max on the 5-hour window and leaves it off the list", () => {
    const state = evaluateUsage("max", [{ kind: "5h", resetsAt: hours(3), spentMicros: 5_000_000 }], now);
    expect(state.windows.map((w) => w.kind)).toEqual(["week"]);
    expect(state.blocked).toBeNull();
  });

  it("blocks everything without a plan", () => {
    expect(evaluateUsage("none", [], now).blocked).toEqual({ reason: "no_plan", resetsAt: null });
  });

  it("says when it resets in plain words", () => {
    expect(untilText(hours(2 + 10 / 60).toISOString(), now)).toBe("2 h 10 m");
    expect(untilText(hours(0.5).toISOString(), now)).toBe("30 m");
    expect(untilText(hours(50).toISOString(), now)).toBe("2 d 2 h");
    expect(untilText(new Date(now.getTime() + 10_000).toISOString(), now)).toBe("1 m");
    expect(limitMessage({ reason: "5h", resetsAt: hours(3).toISOString() }, now)).toBe("You’ve reached your 5-hour limit. It resets in 3 h.");
    expect(limitMessage({ reason: "no_plan", resetsAt: null }, now)).toBe("Choose a plan to keep using mates.");
  });
});

describe("enforcement", () => {
  const spent = () => [{ kind: "5h", resetsAt: hours(3), spentMicros: 999_999_999 }];

  it("stops work only when on", async () => {
    vi.useFakeTimers({ now });
    db.windows = spent();
    process.env.USAGE_ENFORCE = "on";
    await expect(assertUsage("user_1")).rejects.toBeInstanceOf(UsageLimitError);
    process.env.USAGE_ENFORCE = "shadow";
    await expect(assertUsage("user_1")).resolves.toMatchObject({ blocked: { reason: "5h" } });
    process.env.USAGE_ENFORCE = "off";
    await expect(assertUsage("user_1")).resolves.toBeNull();
  });

  it("lets work through when usage can't be read", async () => {
    process.env.USAGE_ENFORCE = "on";
    const { getDb } = await import("../db/client.js");
    const select = vi.spyOn(getDb(), "select");
    expect(select).toBeDefined();
    db.plan = "starter";
    db.windows = null as never; // evaluateUsage throws on this
    await expect(assertUsage("user_1")).resolves.toBeNull();
  });

  it("caps a call at what's left, between a minute and the usual limit", async () => {
    vi.useFakeTimers({ now });
    process.env.USAGE_ENFORCE = "on";
    db.windows = [{ kind: "5h", resetsAt: hours(3), spentMicros: 184_616 - price("CALL_MINUTE") * 5 }];
    expect(await usageCapMs("user_1", price("CALL_MINUTE"), 30 * 60_000)).toBe(5 * 60_000);
    // A fresh Starter session holds under six minutes of voice; Max's week holds the full half hour.
    db.windows = [];
    expect(await usageCapMs("user_1", price("CALL_MINUTE"), 30 * 60_000)).toBe(Math.floor((184_616 / price("CALL_MINUTE")) * 60_000));
    db.plan = "max";
    expect(await usageCapMs("user_1", price("CALL_MINUTE"), 30 * 60_000)).toBe(30 * 60_000);
    db.plan = null;
    db.windows = [{ kind: "5h", resetsAt: hours(3), spentMicros: 184_616 }];
    expect(await usageCapMs("user_1", price("CALL_MINUTE"), 30 * 60_000)).toBe(60_000);
    process.env.USAGE_ENFORCE = "shadow";
    expect(await usageCapMs("user_1", price("CALL_MINUTE"), 30 * 60_000)).toBeUndefined();
  });
});

describe("prices", () => {
  it("bill to the second with a minimum, and can be overridden", () => {
    expect(perMinute("BROWSER_MINUTE", 30, 60)).toBe(2_000);
    expect(perMinute("CALL_MINUTE", 90)).toBe(47_400);
    process.env.PRICE_CALL_MINUTE = "60000";
    expect(perMinute("CALL_MINUTE", 30)).toBe(30_000);
  });
});

describe("OpenRouter costs", () => {
  it("read the reported cost, adding the provider's bill for our own keys", () => {
    expect(readUsage({ cost: 0.0123, prompt_tokens: 900, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 600 } })).toEqual({ costMicros: 12_300, inputTokens: 900, cachedTokens: 600, outputTokens: 40 });
    expect(readUsage({ cost: 0.001, is_byok: true, cost_details: { upstream_inference_cost: 0.02 } }).costMicros).toBe(21_000);
    expect(readUsage(undefined).costMicros).toBe(0);
    expect(usdToMicros(-1)).toBe(0);
  });

  it("are picked out of a stream that passes through unchanged", async () => {
    const chunks = ['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', 'data: {"choices":[],"usage":{"cost":0.002,"prompt_tokens":10,"completion_tokens":2}}\n', "\ndata: [DONE]\n\n"];
    const source = new Response(new ReadableStream({ start(controller) { for (const c of chunks) controller.enqueue(new TextEncoder().encode(c)); controller.close(); } }));
    const passed = meterStream(source, { userId: "user_1", source: "chat" }, "openai/gpt-5.6-luna");
    expect(await passed.text()).toBe(chunks.join(""));
    await vi.waitFor(() => expect(db.executed).toHaveLength(1));
  });
});

describe("recording", () => {
  it("charges in one statement and retries once", async () => {
    db.failExecute = 1;
    await recordUsage({ userId: "user_1", source: "chat", provider: "openrouter", costMicros: 1234, key: "k1" });
    expect(db.executed).toHaveLength(1);
    const text = JSON.stringify(db.executed[0]);
    expect(text).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
    expect(text).toContain("usage_windows");
    expect(text).toContain("usage_daily");
  });

  it("never throws, even when the database is down", async () => {
    db.failExecute = 5;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordUsage({ userId: "user_1", source: "chat", provider: "openrouter", costMicros: 1 })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("usage_record_failed", expect.anything());
    warn.mockRestore();
  });
});

describe("routes", () => {
  const deps = { verifyToken: vi.fn(async () => ({ sub: "user_1" })), findProfile: vi.fn(async () => null) };
  const auth = { authorization: "Bearer test" };

  it("report usage, and never claim a block in shadow mode", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    db.windows = [{ kind: "5h", resetsAt: hours(3), spentMicros: 999_999 }];
    process.env.USAGE_ENFORCE = "shadow";
    const shadow = await (await createApp(deps).request("/v1/usage", { headers: auth })).json();
    expect(shadow).toMatchObject({ plan: { id: "starter", label: "Starter" }, blocked: null, enforced: false });
    expect(shadow.windows[0]).toMatchObject({ kind: "5h", usedPct: 100 });
    process.env.USAGE_ENFORCE = "on";
    const on = await (await createApp(deps).request("/v1/usage", { headers: auth })).json();
    expect(on).toMatchObject({ blocked: { reason: "5h" }, enforced: true });
  });

  it("refuse new work with 429 and when it resets, or 402 without a plan", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    process.env.USAGE_ENFORCE = "on";
    process.env.DEEPGRAM_API_KEY = "test";
    const clip = () => new Request("http://x/v1/transcribe", { method: "POST", headers: { ...auth, "content-type": "audio/mp4" }, body: new Uint8Array([1, 2, 3]) });
    db.windows = [{ kind: "week", resetsAt: hours(30), spentMicros: 999_999 }];
    const limited = await createApp(deps).request(clip());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: "usage_limit", window: "week", resetsAt: hours(30).toISOString(), plan: "starter", message: "You’ve reached your weekly limit. It resets in 1 d 6 h." } });
    db.plan = "none";
    const noPlan = await createApp(deps).request(clip());
    expect(noPlan.status).toBe(402);
    expect(await noPlan.json()).toMatchObject({ error: { code: "plan_required" } });
  });

  it("keep the admin routes closed without the admin key", async () => {
    const app = createApp(deps);
    expect((await app.request("/internal/finance/summary")).status).toBe(401);
    process.env.ADMIN_API_KEY = "secret-admin-key";
    expect((await app.request("/internal/finance/summary", { headers: { "x-admin-key": "wrong" } })).status).toBe(401);
    expect((await app.request("/internal/finance/summary", { headers: { "x-admin-key": "secret-admin-key" } })).status).toBe(200);
  });
});
