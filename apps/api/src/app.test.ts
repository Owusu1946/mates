import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

const deps = {
  verifyToken: vi.fn(async () => ({ sub: "user_123" })),
  findProfile: vi.fn(async () => null),
  requestChat: vi.fn(
    async () =>
      new Response(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n',
        { headers: { "content-type": "text/event-stream" } },
      ),
  ),
};

describe("API contract", () => {
  it("reports health", async () => {
    const response = await createApp(deps).request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("treats a trailing slash as the same route", async () => {
    const response = await createApp(deps).request("/health/");
    expect(response.status).toBe(301);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/health");
  });

  it("normalizes missing authentication", async () => {
    const response = await createApp(deps).request("/v1/me");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns the authenticated subject", async () => {
    const response = await createApp(deps).request("/v1/me", {
      headers: { authorization: "Bearer test" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { id: "user_123" } });
  });

  it("requires authentication and a valid user turn before calling the model", async () => {
    deps.requestChat.mockClear();
    const missingAuth = await createApp(deps).request("/v1/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
    });
    expect(missingAuth.status).toBe(401);
    const invalid = await createApp(deps).request("/v1/chat", {
      method: "POST",
      headers: {
        authorization: "Bearer test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "assistant", content: "Hello" }],
      }),
    });
    expect(invalid.status).toBe(400);
    expect(deps.requestChat).not.toHaveBeenCalled();
  });

  it("streams an authenticated chat response", async () => {
    const response = await createApp(deps).request("/v1/chat", {
      method: "POST",
      headers: {
        authorization: "Bearer test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain("Hello");
  });
});

describe("GitHub connect callback", () => {
  const env = { GITHUB_APP_ID: "1", GITHUB_APP_SLUG: "mates", GITHUB_APP_PRIVATE_KEY: "x", GITHUB_APP_CLIENT_ID: "Iv1.test", GITHUB_APP_CLIENT_SECRET: "s", GITHUB_STATE_SECRET: "test" };
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const [key, value] of Object.entries(env)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  });
  afterEach(() => {
    for (const key of Object.keys(env)) process.env[key] = saved[key];
  });

  it("sends an expired or forged state back to the app with a reason", async () => {
    const response = await createApp(deps).request("/v1/github/callback?state=nope&code=abc");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("muse-clone://connections?github=failed&reason=expired");
  });

  it("signs the user in with GitHub when the install returned no code", async () => {
    const { signState } = await import("./github.js");
    const state = signState("user_123", Date.now(), "exp://10.0.0.2:8081/--/connections");
    const response = await createApp(deps).request(`/v1/github/callback?installation_id=42&setup_action=update&state=${encodeURIComponent(state)}`);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("Iv1.test");
    expect(location.searchParams.get("state")).toBe(state);
  });
});
