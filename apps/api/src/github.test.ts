import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signState, verifyState } from "./github.js";

describe("GitHub install state", () => {
  const saved = process.env.GITHUB_STATE_SECRET;
  beforeEach(() => {
    process.env.GITHUB_STATE_SECRET = "test-secret";
  });
  afterEach(() => {
    process.env.GITHUB_STATE_SECRET = saved;
  });

  it("round-trips the user who started the install", () => {
    expect(verifyState(signState("user_123"))).toBe("user_123");
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
