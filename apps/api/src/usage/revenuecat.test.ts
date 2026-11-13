import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./billing.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./billing.js")>(),
  setPlan: vi.fn(),
}));

import { setPlan } from "./billing.js";
import { handleRevenueCatEvent, revenueCatAuthorized, subscriberPlan, syncFromRevenueCat } from "./revenuecat.js";

const originalEnv = { ...process.env };
const customer = (sandbox: boolean, expires = "2099-01-01T00:00:00Z") => ({ subscriber: {
  entitlements: { starter: { product_identifier: "starter_monthly", expires_date: expires } },
  subscriptions: { starter_monthly: { is_sandbox: sandbox } },
} });

beforeEach(() => {
  process.env.REVENUECAT_SECRET_KEY = "secret";
  process.env.REVENUECAT_WEBHOOK_AUTH = "webhook";
  delete process.env.REVENUECAT_ALLOW_SANDBOX;
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("RevenueCat subscription sync", () => {
  it("accepts only the configured webhook authorization", () => {
    expect(revenueCatAuthorized("webhook")).toBe(true);
    expect(revenueCatAuthorized("wrong")).toBe(false);
    expect(revenueCatAuthorized(undefined)).toBe(false);
    delete process.env.REVENUECAT_WEBHOOK_AUTH;
    expect(revenueCatAuthorized("webhook")).toBe(false);
  });

  it("does not grant a sandbox entitlement on a production API", () => {
    expect(subscriberPlan(customer(true), false)).toBe("none");
    expect(subscriberPlan(customer(true), true)).toBe("starter");
    expect(subscriberPlan(customer(false), false)).toBe("starter");
    expect(subscriberPlan(customer(false, "2000-01-01T00:00:00Z"), false)).toBe("none");
  });

  it("does not change a plan when the response is malformed or RevenueCat fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockResolvedValueOnce(Response.json({ subscriber: {} })));
    await expect(syncFromRevenueCat("user_1")).rejects.toThrow();
    await expect(syncFromRevenueCat("user_1")).rejects.toThrow();
    expect(setPlan).not.toHaveBeenCalled();
  });

  it("syncs the server-verified plan and skips sandbox events unless explicitly enabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(customer(false))));
    await handleRevenueCatEvent({ type: "INITIAL_PURCHASE", environment: "SANDBOX", app_user_id: "user_1" });
    expect(setPlan).not.toHaveBeenCalled();
    await handleRevenueCatEvent({ type: "INITIAL_PURCHASE", environment: "PRODUCTION", app_user_id: "user_1" });
    expect(setPlan).toHaveBeenCalledWith("user_1", "starter", { source: "revenuecat" });
  });

  it("reconciles both sides of a transfer and ignores anonymous IDs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json(customer(false)))));
    await handleRevenueCatEvent({ type: "TRANSFER", transferred_from: ["user_old", "$RCAnonymousID:1"], transferred_to: ["user_new"] });
    expect(vi.mocked(setPlan).mock.calls.map(([id]) => id)).toEqual(["user_old", "user_new"]);
  });
});
