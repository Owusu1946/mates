import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./billing.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./billing.js")>(),
  setPlan: vi.fn(),
}));

import { setPlan } from "./billing.js";
import { handleRevenueCatEvent, revenueCatAuthorized, subscriberPlan, syncFromRevenueCat } from "./revenuecat.js";
import { createApp } from "../app.js";

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

  it("chooses the highest active entitlement and respects a billing grace period", () => {
    const data = { subscriber: {
      entitlements: {
        starter: { product_identifier: "starter_monthly", expires_date: "2099-01-01T00:00:00Z" },
        pro: { product_identifier: "pro_monthly", expires_date: "2000-01-01T00:00:00Z", grace_period_expires_date: "2099-01-01T00:00:00Z" },
      },
      subscriptions: { starter_monthly: { is_sandbox: false }, pro_monthly: { is_sandbox: false } },
    } };
    expect(subscriberPlan(data, false)).toBe("pro");
  });

  it("preserves existing state by rejecting entitlements with an unknown subscription", () => {
    const data = customer(false);
    data.subscriber.subscriptions = {} as typeof data.subscriber.subscriptions;
    expect(() => subscriberPlan(data, false)).toThrow("no matching subscription");
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

describe("RevenueCat routes", () => {
  const app = createApp({ verifyToken: async () => ({ sub: "user_1" }) });

  it("rejects unauthenticated and malformed webhooks", async () => {
    const request = (authorization: string, body: string) => app.request("/webhooks/revenuecat", {
      method: "POST", headers: { authorization, "content-type": "application/json" }, body,
    });
    expect((await request("wrong", "{}" )).status).toBe(401);
    expect((await request("webhook", "not json")).status).toBe(400);
    expect((await request("webhook", JSON.stringify({ event: { type: "TEST" } }))).status).toBe(200);
  });

  it("requires a Clerk bearer token for the billing sync", async () => {
    const response = await app.request("/v1/billing/sync", { method: "POST" });
    expect(response.status).toBe(401);
    expect(setPlan).not.toHaveBeenCalled();
  });
});
