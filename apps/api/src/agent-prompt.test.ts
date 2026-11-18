import { describe, expect, it } from "vitest";
import { buildPromptMessages, sortToolsByName, stablePromptPrefix } from "./agent-prompt.js";

describe("agent prompt cache prefix", () => {
  it("keeps the stable system prefix byte-identical as request time changes", () => {
    const build = (clock: string) => buildPromptMessages({
      stableInstructions: "stable instructions\ntool guidance",
      stableUserContext: "stable user preamble",
      turns: [{ role: "user" as const, content: "Hello" }],
      volatileContext: [`Current time: ${clock}`],
    });
    const first = build("2026-11-18T12:30Z");
    const second = build("2026-11-18T12:31Z");

    expect(stablePromptPrefix(first)).toBe(stablePromptPrefix(second));
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
  });

  it("orders tool schemas by name regardless of their input order", () => {
    const tools = [{ function: { name: "z_tool" } }, { function: { name: "a_tool" } }];
    expect(sortToolsByName(tools).map((tool) => tool.function.name)).toEqual(["a_tool", "z_tool"]);
  });
});
