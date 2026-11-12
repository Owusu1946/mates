import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { pickMate } from "./slack-events.js";

describe("which mate a Slack message is for", () => {
  const lead = { name: "Kwabena" };
  const crew = [lead, { name: "Ama" }, { name: "Kojo" }, { name: "Ama Serwaa" }];

  it("finds the named mate and keeps only the task", () => {
    expect(pickMate("<@U0BOT> Kojo, find a time with Efua", crew, lead)).toEqual({ mate: crew[2], task: "find a time with Efua" });
    expect(pickMate("ask Ama to find a cheaper cake", crew, lead)).toEqual({ mate: crew[1], task: "find a cheaper cake" });
    expect(pickMate("kojo: hold Saturday", crew, lead).mate).toBe(crew[2]);
  });

  it("prefers the longest matching name", () => {
    expect(pickMate("Ama Serwaa, draft the invite", crew, lead).mate).toBe(crew[3]);
  });

  it("goes to the lead when no mate is named, or a name is only the start of a word", () => {
    expect(pickMate("<@U0BOT> what's on today?", crew, lead)).toEqual({ mate: lead, task: "what's on today?" });
    expect(pickMate("Amazing work, thanks", crew, lead).mate).toBe(lead);
  });
});

describe("Slack's calls to /v1/slack/events", () => {
  const saved = process.env.SLACK_SIGNING_SECRET;
  beforeEach(() => {
    process.env.SLACK_SIGNING_SECRET = "signing-secret";
  });
  afterEach(() => {
    process.env.SLACK_SIGNING_SECRET = saved;
  });
  const app = () => createApp({ verifyToken: vi.fn(async () => ({ sub: "user_123" })) });
  const post = (body: string, secret = "signing-secret") => {
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;
    return app().request("/v1/slack/events", { method: "POST", headers: { "content-type": "application/json", "x-slack-request-timestamp": ts, "x-slack-signature": signature }, body });
  };

  it("answers Slack's URL check", async () => {
    const response = await post(JSON.stringify({ type: "url_verification", challenge: "abc123" }));
    expect(await response.json()).toEqual({ challenge: "abc123" });
  });

  it("refuses anything not signed by Slack", async () => {
    expect((await post(JSON.stringify({ type: "url_verification", challenge: "x" }), "wrong-secret")).status).toBe(401);
    expect((await app().request("/v1/slack/events", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("rejects a forged connect link", async () => {
    expect((await app().request("/v1/slack/connect?team=T1&user=<script>")).status).toBe(400);
  });
});
