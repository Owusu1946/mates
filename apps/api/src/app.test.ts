import { describe, expect, it, vi } from "vitest";
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
