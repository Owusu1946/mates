import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { signState } from "./slack-security.js";

const app = () => createApp({ verifyToken: vi.fn(async () => ({ sub: "user_123" })) });
const signedIn = { headers: { authorization: "Bearer token" } };
const KEYS = ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_SIGNING_SECRET", "SLACK_TOKEN_KEY", "SLACK_STATE_SECRET"] as const;

describe("Slack install and linking routes", () => {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  beforeEach(() => {
    process.env.SLACK_CLIENT_ID = "123.456";
    process.env.SLACK_CLIENT_SECRET = "client-secret";
    process.env.SLACK_SIGNING_SECRET = "signing-secret";
    process.env.SLACK_TOKEN_KEY = randomBytes(32).toString("base64");
    process.env.SLACK_STATE_SECRET = "state-secret";
  });
  afterEach(() => {
    for (const key of KEYS) process.env[key] = saved[key];
  });

  it("says Slack isn't set up when its keys are missing", async () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const response = await app().request("/v1/slack", signedIn);
    expect(await response.json()).toEqual({ configured: false, workspaces: [] });
    expect((await app().request("/v1/slack/install", signedIn)).status).toBe(503);
  });

  it("hands the app Slack's install page with a signed state", async () => {
    const response = await app().request("/v1/slack/install?returnTo=mates%3A%2F%2Fconnections", signedIn);
    const { url } = (await response.json()) as { url: string };
    const link = new URL(url);
    expect(link.origin + link.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(link.searchParams.get("client_id")).toBe("123.456");
    expect(link.searchParams.get("scope")).toContain("chat:write.customize");
    expect(link.searchParams.get("state")).toMatch(/^[\w-]+\.[\w-]+$/);
  });

  it("sends an expired or forged install back to the app as failed, never elsewhere", async () => {
    const forged = await app().request("/v1/slack/callback?state=nope&code=abc");
    expect(forged.headers.get("location")).toBe("mates://connections?slack=failed&reason=expired");
    const cancelled = await app().request(`/v1/slack/callback?state=${encodeURIComponent(signState("install", { u: "user_123", r: "https://evil.example" }))}&error=access_denied`);
    expect(cancelled.headers.get("location")).toBe("mates://connections?slack=failed&reason=cancelled");
  });

  it("refuses a link token that is expired or meant for something else", async () => {
    const post = (token: string) => app().request("/v1/slack/link", { method: "POST", headers: { ...signedIn.headers, "content-type": "application/json" }, body: JSON.stringify({ token }) });
    expect((await post(signState("link", { t: "T1", s: "U1" }, 0))).status).toBe(400);
    expect((await post(signState("install", { t: "T1", s: "U1" }))).status).toBe(400);
  });
});
