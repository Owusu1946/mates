import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken, signState, verifySlackSignature, verifyState } from "./slack-security.js";

const sign = (body: string, ts: string, secret: string) => `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;

describe("Slack request signatures", () => {
  const body = "token=x&team_id=T1&text=hello";
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);

  it("accepts a fresh request signed with the app's secret", () => {
    expect(verifySlackSignature(body, ts, sign(body, ts, "shh"), "shh", now)).toBe(true);
  });

  it("refuses a changed body, a wrong secret, or a missing header", () => {
    expect(verifySlackSignature(`${body}&extra=1`, ts, sign(body, ts, "shh"), "shh", now)).toBe(false);
    expect(verifySlackSignature(body, ts, sign(body, ts, "other"), "shh", now)).toBe(false);
    expect(verifySlackSignature(body, undefined, sign(body, ts, "shh"), "shh", now)).toBe(false);
    expect(verifySlackSignature(body, ts, undefined, "shh", now)).toBe(false);
    expect(verifySlackSignature(body, ts, sign(body, ts, ""), "", now)).toBe(false);
  });

  it("refuses a replay older than five minutes", () => {
    const old = String(now / 1000 - 301);
    expect(verifySlackSignature(body, old, sign(body, old, "shh"), "shh", now)).toBe(false);
  });
});

describe("Slack secrets at rest and in flight", () => {
  const saved = { key: process.env.SLACK_TOKEN_KEY, state: process.env.SLACK_STATE_SECRET };
  beforeEach(() => {
    process.env.SLACK_TOKEN_KEY = randomBytes(32).toString("base64");
    process.env.SLACK_STATE_SECRET = "test-state-secret";
  });
  afterEach(() => {
    process.env.SLACK_TOKEN_KEY = saved.key;
    process.env.SLACK_STATE_SECRET = saved.state;
  });

  it("encrypts bot tokens so the stored value reveals nothing and can't be altered", () => {
    const stored = encryptToken("xoxb-123-secret");
    expect(stored).not.toContain("xoxb");
    expect(decryptToken(stored)).toBe("xoxb-123-secret");
    expect(encryptToken("xoxb-123-secret")).not.toBe(stored); // fresh IV each time
    const [iv, tag, data] = stored.split(".");
    const flipped = Buffer.from(data!, "base64url");
    flipped[0]! ^= 1;
    expect(() => decryptToken(`${iv}.${tag}.${flipped.toString("base64url")}`)).toThrow();
  });

  it("refuses to run with a key of the wrong size", () => {
    process.env.SLACK_TOKEN_KEY = randomBytes(16).toString("base64");
    expect(() => encryptToken("xoxb")).toThrow(/32 bytes/);
  });

  it("round-trips signed state and rejects tampering, expiry and the wrong purpose", () => {
    const state = signState("install", { u: "user_123" });
    expect(verifyState("install", state)).toEqual({ u: "user_123" });
    expect(verifyState("link", state)).toBeNull();
    const [, signature] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "user_evil", e: Date.now() + 60_000 })).toString("base64url");
    expect(verifyState("install", `${forged}.${signature}`)).toBeNull();
    expect(verifyState("install", signState("install", { u: "user_123" }, 0))).toBeNull();
    expect(verifyState("install", "garbage")).toBeNull();
  });
});
