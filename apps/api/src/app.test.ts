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
  it("requires authentication and a bounded sample for first-text timing", async () => {
    const app = createApp(deps);
    const path = "/v1/runs/00000000-0000-4000-8000-000000000001/first-text";
    const send = (headers: Record<string, string>, elapsedMs: number) => app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ elapsedMs }) });
    expect((await send({}, 1200)).status).toBe(401);
    expect((await send({ authorization: "Bearer test" }, -1)).status).toBe(400);
    expect((await send({ authorization: "Bearer test" }, 600_001)).status).toBe(400);
  });

  it("replays typed run events over SSE and closes after the terminal event", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const snapshots = [
      { run: { id, status: "running", sequence: 1 }, events: [{ sequence: 1, type: "progress", payload: { status: "running" }, timestamp: new Date("2026-11-18T12:00:00Z") }] },
      { run: { id, status: "completed", sequence: 2 }, events: [{ sequence: 2, type: "run.completed", payload: { status: "completed" }, timestamp: new Date("2026-11-18T12:00:01Z") }] },
    ];
    const runSnapshot = vi.fn(async () => snapshots.shift() ?? null);
    const app = createApp({ ...deps, runSnapshot: runSnapshot as never });
    const response = await app.request(`/v1/runs/${id}/events?after=0`, { headers: { authorization: "Bearer test" } });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("id: 1\nevent: progress");
    expect(body).toContain('"version":1,"sequence":1');
    expect(body).toContain("id: 2\nevent: run.completed");
    expect(runSnapshot).toHaveBeenCalledTimes(2);
  });

  it("validates the run event cursor before opening the stream", async () => {
    const runSnapshot = vi.fn(async () => null);
    const app = createApp({ ...deps, runSnapshot: runSnapshot as never });
    const response = await app.request("/v1/runs/00000000-0000-4000-8000-000000000001/events?after=-1", { headers: { authorization: "Bearer test" } });
    expect(response.status).toBe(400);
    expect(runSnapshot).not.toHaveBeenCalled();
  });

  it("runs one-to-one chat live and returns the run id on the same SSE response", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const submitRun = vi.fn(async () => ({ id, status: "queued" }));
    const executeLiveRun = vi.fn(async () => {});
    const runSnapshot = vi.fn(async () => ({ run: { id, status: "completed", sequence: 1 }, events: [{ sequence: 1, type: "run.completed", payload: { status: "completed", content: [] }, timestamp: new Date("2026-11-18T12:00:00Z") }] }));
    const app = createApp({
      ...deps,
      chats: { get: vi.fn(async () => ({ kind: "mate" })) } as never,
      liveChatEnabled: () => true,
      submitRun: submitRun as never,
      executeLiveRun,
      runSnapshot: runSnapshot as never,
    });
    const response = await app.request("/v1/runs", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ chatId: "mate_123", requestKey: "request_key_123", assistantMessageId: "assistant_123", parentId: "user_123", messages: [{ role: "user", content: "Hello" }] }),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-run-id")).toBe(id);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: run.completed");
    expect(submitRun).toHaveBeenCalledWith("user_123", expect.any(Object), { publish: false });
    expect(executeLiveRun).toHaveBeenCalledWith(id, expect.any(AbortSignal), expect.any(Function));
  });

  it("requests a safe worker handoff when the live SSE client disconnects", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    let shouldHandoff: (() => "disconnect" | "deadline" | null) | undefined;
    const executeLiveRun = vi.fn(async (_id: string, _signal: AbortSignal, check: typeof shouldHandoff) => { shouldHandoff = check; });
    const app = createApp({
      ...deps,
      chats: { get: vi.fn(async () => ({ kind: "mate" })) } as never,
      liveChatEnabled: () => true,
      submitRun: vi.fn(async () => ({ id, status: "queued" })) as never,
      executeLiveRun,
      runSnapshot: vi.fn(async () => ({ run: { id, status: "running", sequence: 0 }, events: [] })) as never,
    });
    const response = await app.request("/v1/runs", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ chatId: "mate_123", requestKey: "request_key_123", assistantMessageId: "assistant_123", parentId: "user_123", messages: [{ role: "user", content: "Hello" }] }),
    });
    await response.body?.cancel();

    expect(shouldHandoff?.()).toBe("disconnect");
  });

  it("keeps the worker path when live chat rollout is disabled", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const submitRun = vi.fn(async () => ({ id, status: "queued" }));
    const executeLiveRun = vi.fn(async () => {});
    const app = createApp({
      ...deps,
      chats: { get: vi.fn(async () => ({ kind: "mate" })) } as never,
      liveChatEnabled: () => false,
      submitRun: submitRun as never,
      executeLiveRun,
    });
    const response = await app.request("/v1/runs", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ chatId: "mate_123", requestKey: "request_key_123", assistantMessageId: "assistant_123", parentId: "user_123", messages: [{ role: "user", content: "Hello" }] }),
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(submitRun).toHaveBeenCalledWith("user_123", expect.any(Object), { publish: true });
    expect(executeLiveRun).not.toHaveBeenCalled();
  });

  it("keeps group chats on the worker JSON path even when SSE is requested", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const submitRun = vi.fn(async () => ({ id, status: "queued" }));
    const executeLiveRun = vi.fn(async () => {});
    const app = createApp({
      ...deps,
      chats: { get: vi.fn(async () => ({ kind: "group" })) } as never,
      submitRun: submitRun as never,
      executeLiveRun,
    });
    const response = await app.request("/v1/runs", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ chatId: "group_123", requestKey: "request_key_123", assistantMessageId: "assistant_123", parentId: "user_123", messages: [{ role: "user", content: "Hello" }] }),
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(submitRun).toHaveBeenCalledWith("user_123", expect.any(Object), { publish: true });
    expect(executeLiveRun).not.toHaveBeenCalled();
  });

  it("takes Composio trigger events only when they're signed", async () => {
    const saved = { secret: process.env.COMPOSIO_WEBHOOK_SECRET, key: process.env.COMPOSIO_API_KEY };
    const send = () => createApp(deps).request("/v1/composio/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "composio.trigger.message", data: {} }) });
    delete process.env.COMPOSIO_WEBHOOK_SECRET;
    expect((await send()).status).toBe(503);
    process.env.COMPOSIO_WEBHOOK_SECRET = "whsec_dGVzdC1zZWNyZXQtZm9yLXRlc3RzLW9ubHk=";
    process.env.COMPOSIO_API_KEY = saved.key ?? "test-key";
    expect((await send()).status).toBe(401);
    process.env.COMPOSIO_WEBHOOK_SECRET = saved.secret;
    if (saved.key === undefined) delete process.env.COMPOSIO_API_KEY;
    if (saved.secret === undefined) delete process.env.COMPOSIO_WEBHOOK_SECRET;
  });

  it("reports health", async () => {
    const response = await createApp(deps).request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("accepts site visits from the landing page without auth, and never from crawlers", async () => {
    const response = await createApp(deps).request("/site/visit", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "https://agents.askorin.app", "user-agent": "WhatsApp/2.23.20.0" },
      body: JSON.stringify({ path: "/", referrer: "" }),
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://agents.askorin.app");
  });

  it("turns away waitlist sign-ups that aren't emails, and bots quietly", async () => {
    const app = createApp(deps);
    const join = (body: object) =>
      app.request("/site/waitlist", { method: "POST", headers: { "content-type": "application/json", origin: "https://agents.askorin.app" }, body: JSON.stringify(body) });
    const bad = await join({ email: "not-an-email" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "INVALID_EMAIL" } });
    const bot = await join({ email: "bot@example.com", website: "https://spam.example" });
    expect(bot.status).toBe(200);
    expect(await bot.json()).toEqual({ position: null, already: false });
  });

  it("guards voice typing: auth, a configured key, and an audio upload", async () => {
    const app = createApp(deps);
    const form = (file: File) => {
      const body = new FormData();
      body.append("audio", file);
      return body;
    };
    const clip = new File([new Uint8Array([1, 2, 3])], "dictation.m4a", { type: "audio/mp4" });
    expect((await app.request("/v1/transcribe", { method: "POST", body: form(clip) })).status).toBe(401);

    const saved = process.env.DEEPGRAM_API_KEY;
    delete process.env.DEEPGRAM_API_KEY;
    const unconfigured = await app.request("/v1/transcribe", { method: "POST", headers: { authorization: "Bearer test" }, body: form(clip) });
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toMatchObject({ error: { code: "TRANSCRIPTION_UNAVAILABLE" } });

    process.env.DEEPGRAM_API_KEY = "test-key";
    const text = new File(["hello"], "notes.txt", { type: "text/plain" });
    const wrong = await app.request("/v1/transcribe", { method: "POST", headers: { authorization: "Bearer test" }, body: form(text) });
    expect(wrong.status).toBe(400);

    // What the phone sends: the clip's bytes as the body, typed audio/mp4.
    const deepgram = vi.fn(async () => new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: "Hello Nova." }] }] } }), { status: 200 }));
    vi.stubGlobal("fetch", deepgram);
    const raw = await app.request("/v1/transcribe", { method: "POST", headers: { authorization: "Bearer test", "content-type": "audio/mp4" }, body: new Uint8Array([1, 2, 3]) });
    expect(raw.status).toBe(200);
    expect(await raw.json()).toEqual({ text: "Hello Nova." });
    expect(deepgram).toHaveBeenCalledWith(expect.stringContaining("api.deepgram.com/v1/listen"), expect.objectContaining({ headers: expect.objectContaining({ "content-type": "audio/mp4" }) }));
    vi.unstubAllGlobals();
    const empty = await app.request("/v1/transcribe", { method: "POST", headers: { authorization: "Bearer test", "content-type": "audio/mp4" }, body: new Uint8Array([]) });
    expect(empty.status).toBe(400);
    if (saved === undefined) delete process.env.DEEPGRAM_API_KEY;
    else process.env.DEEPGRAM_API_KEY = saved;
  });

  it("requires sign-in to set up the lead mate", async () => {
    const response = await createApp(deps).request("/v1/leader", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Kojo", shape: "cloud", color: "blue" }) });
    expect(response.status).toBe(401);
  });

  it("guards voice calls: sign-in to start one, a configured server, and the call token for the agent", async () => {
    const app = createApp(deps);
    const body = JSON.stringify({ chatId: "mate_x", leadMateId: "00000000-0000-4000-8000-000000000001" });
    const json = { "content-type": "application/json" };
    expect((await app.request("/v1/calls", { method: "POST", headers: json, body })).status).toBe(401);

    const saved = process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_URL;
    const unconfigured = await app.request("/v1/calls", { method: "POST", headers: { ...json, authorization: "Bearer test" }, body });
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toMatchObject({ error: { code: "CALLS_UNAVAILABLE" } });
    if (saved !== undefined) process.env.LIVEKIT_URL = saved;

    const callId = "00000000-0000-4000-8000-000000000002";
    expect((await app.request(`/v1/calls/${callId}/agent/context`)).status).toBe(401);
    expect((await app.request(`/v1/calls/${callId}/agent/context`, { headers: { "x-call-token": "forged.token" } })).status).toBe(401);
    const end = await app.request(`/v1/calls/${callId}/agent/end`, { method: "POST", headers: { ...json, "x-call-token": "forged.token" }, body: JSON.stringify({ durationSec: 30, transcript: [] }) });
    expect(end.status).toBe(401);
    const invite = await app.request(`/v1/calls/${callId}/agent/mates`, { method: "POST", headers: { ...json, "x-call-token": "forged.token" }, body: JSON.stringify({ mateId: callId }) });
    expect(invite.status).toBe(401);
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

  it("authenticates feedback requests and validates feedback before reaching storage", async () => {
    const app = createApp(deps);
    const path = "/v1/messages/assistant_123/feedback";
    const unauthorized = await app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: "up" }) });
    expect(unauthorized.status).toBe(401);

    const invalid = await app.request(path, {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ rating: "down" }),
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "INVALID_FEEDBACK" } });

    const noDeleteAuth = await app.request(path, { method: "DELETE" });
    expect(noDeleteAuth.status).toBe(401);
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
    expect(response.headers.get("location")).toBe("mates://connections?github=failed&reason=expired");
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
