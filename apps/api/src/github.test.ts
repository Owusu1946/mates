import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safeReturn, signState, verifyState } from "./github.js";

describe("GitHub install state", () => {
  const saved = process.env.GITHUB_STATE_SECRET;
  beforeEach(() => {
    process.env.GITHUB_STATE_SECRET = "test-secret";
  });
  afterEach(() => {
    process.env.GITHUB_STATE_SECRET = saved;
  });

  it("round-trips the user who started the install", () => {
    expect(verifyState(signState("user_123"))).toEqual({ userId: "user_123", returnTo: "muse-clone://connections" });
    expect(verifyState(signState("user_123", Date.now(), "exp://192.168.0.2:8081/--/connections"))?.returnTo).toBe("exp://192.168.0.2:8081/--/connections");
  });

  it("only returns to the app, never to the web", () => {
    expect(safeReturn("https://evil.example/steal")).toBe("muse-clone://connections");
    expect(safeReturn("javascript:alert(1)")).toBe("muse-clone://connections");
    expect(safeReturn("muse-clone://connections")).toBe("muse-clone://connections");
  });

  it("rejects tampered, expired and foreign states", () => {
    const state = signState("user_123", 0);
    const [payload, signature] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "user_evil", e: Date.now() + 60_000, n: "x" })).toString("base64url");
    expect(verifyState(`${forged}.${signature}`)).toBeNull();
    expect(verifyState(state)).toBeNull(); // signed at time 0: long expired
    expect(verifyState(`${payload}`)).toBeNull();
    const fresh = signState("user_123");
    process.env.GITHUB_STATE_SECRET = "another-secret";
    expect(verifyState(fresh)).toBeNull();
  });
});
