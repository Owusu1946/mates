import { describe, expect, it } from "vitest";
import { gitAuthEnv } from "./computer.js";

describe("computer git auth", () => {
  it("authenticates through one-off environment config, never the raw token", () => {
    const env = gitAuthEnv("ghs_exampletoken1234567890");
    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
    expect(env.GIT_CONFIG_VALUE_0).toBe(`AUTHORIZATION: basic ${Buffer.from("x-access-token:ghs_exampletoken1234567890").toString("base64")}`);
    expect(JSON.stringify(env)).not.toContain("ghs_exampletoken1234567890");
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
  });
});
