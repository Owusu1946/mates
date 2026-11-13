import { TokenVerifier } from "livekit-server-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CALL_AGENT_NAME, callTaskSchema, joinToken, signCallToken, summarise, transcriptTurn, verifyCallToken, voicesFor, VOICES } from "./calls.js";

const env = { LIVEKIT_URL: "wss://mates-test.livekit.cloud", LIVEKIT_API_KEY: "APItest", LIVEKIT_API_SECRET: "secret-for-tests-only-0123456789abcdef", CALL_TOKEN_SECRET: "call-secret" };
const saved: Record<string, string | undefined> = {};

describe("voice calls", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(env)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  });
  afterEach(() => {
    for (const key of Object.keys(env)) process.env[key] = saved[key];
    vi.unstubAllGlobals();
  });

  it("gives the agent a call token that works for that call only, until it expires", () => {
    const now = Date.UTC(2026, 10, 10, 9);
    const token = signCallToken("call-1", "user_1", now);
    expect(verifyCallToken(token, "call-1", now + 60_000)).toBe("user_1");
    expect(verifyCallToken(token, "call-2", now)).toBeNull();
    expect(verifyCallToken(token, "call-1", now + 4 * 3600_000)).toBeNull();
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ c: "call-1", u: "user_2", e: now + 3600_000 })).toString("base64url");
    expect(verifyCallToken(`${forged}.${signature}`, "call-1", now)).toBeNull();
    expect(verifyCallToken(`${payload}.x${signature!.slice(1)}`, "call-1", now)).toBeNull();
    expect(verifyCallToken(undefined, "call-1", now)).toBeNull();
  });

  it("signs a join token for this call's room that dispatches the voice agent with the call's details", async () => {
    const jwt = await joinToken("user_1", "call_abc", { callId: "abc", callToken: "t0k", userName: "Ama", timezone: "Africa/Accra" });
    const claims = await new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET).verify(jwt);
    expect(claims.sub).toBe("user_user_1");
    expect(claims.name).toBe("Ama");
    expect(claims.video).toMatchObject({ roomJoin: true, room: "call_abc", canPublish: true, canSubscribe: true });
    const agents = (claims.roomConfig as { agents?: { agentName: string; metadata: string }[] }).agents ?? [];
    expect(agents).toHaveLength(1);
    expect(agents[0]!.agentName).toBe(CALL_AGENT_NAME);
    expect(JSON.parse(agents[0]!.metadata)).toEqual({ callId: "abc", callToken: "t0k", userName: "Ama", timezone: "Africa/Accra" });
  });

  it("gives each mate a voice that stays the same across calls and is never shared on one call", () => {
    const ids = ["m1", "m2", "m3", "m4"];
    const first = voicesFor(ids);
    expect(new Set(first.values()).size).toBe(4);
    expect([...first.values()].every((v) => (VOICES as readonly string[]).includes(v))).toBe(true);
    expect(voicesFor(["m3"]).get("m3")).toBe(voicesFor(["m3", "m9"]).get("m3"));
    expect(voicesFor(ids)).toEqual(first);
  });

  it("summarises a call, and falls back to plain facts when the model can't", async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test";
    const lines = [{ speaker: "You", text: "Remind me to call the venue tomorrow" }, { speaker: "Kojo", text: "Sure, I'll set that up." }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: " We planned the venue call. ", action_items: ["Kojo: remind you to call the venue", ""] }) } }] }), { status: 200 })));
    expect(await summarise(lines, 3)).toEqual({ summary: "We planned the venue call.", actionItems: ["Kojo: remind you to call the venue"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    expect(await summarise(lines, 3)).toEqual({ summary: "We talked for 3 minutes.", actionItems: [] });
    expect(await summarise([], 0)).toEqual({ summary: "The call ended before anyone spoke.", actionItems: [] });
    process.env.OPENROUTER_API_KEY = saved;
  });
});

describe("tasks from a meeting", () => {
  it("carry the newest lines of the transcript that fit in one turn", () => {
    const lines = Array.from({ length: 300 }, (_, i) => ({ speaker: "Meeting", text: `Point number ${i} about the launch plan.` }));
    const turn = transcriptTurn("Meeting", lines);
    expect(turn.length).toBeLessThanOrEqual(7_900);
    expect(turn.startsWith("Meeting so far (transcript")).toBe(true);
    expect(turn).toContain("Point number 299");
    expect(turn).not.toContain("Point number 0 ");
  });

  it("accept up to 150 transcript lines with a task, and none at all", () => {
    const line = { speaker: "Meeting", text: "We agreed on the 24th.", at: "2026-11-13T10:00:00Z" };
    const mateId = "00000000-0000-4000-8000-000000000001";
    expect(callTaskSchema.safeParse({ mateId, task: "make a deck", context: [line] }).success).toBe(true);
    expect(callTaskSchema.safeParse({ mateId, task: "make a deck" }).success).toBe(true);
    expect(callTaskSchema.safeParse({ mateId, task: "make a deck", context: Array(151).fill(line) }).success).toBe(false);
  });
});
