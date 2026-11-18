import { describe, expect, it } from "vitest";
import { buildPromptMessages, isTravelConversation, isTravelRequest, isTrivialChatMessage, sortToolsByName, stablePromptPrefix } from "./agent-prompt.js";

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

  it("treats only greetings and thanks as trivial turns", () => {
    expect(isTrivialChatMessage("Hello! ")).toBe(true);
    expect(isTrivialChatMessage("good morning")).toBe(true);
    expect(isTrivialChatMessage("Thanks so much")).toBe(true);
    expect(isTrivialChatMessage("Send this email please")).toBe(false);
    expect(isTrivialChatMessage("hello, what's on my calendar?")).toBe(false);
  });

  it("never treats a possible yes as trivial, since it may approve an action", () => {
    for (const reply of ["ok", "Okay", "got it", "great", "cool", "nice", "yes", "sure", "do it"]) expect(isTrivialChatMessage(reply)).toBe(false);
    // Anything answering the mate's question keeps its tools, even a thank-you.
    expect(isTrivialChatMessage("thanks", "Want me to email Kofi the invoice?")).toBe(false);
    expect(isTrivialChatMessage("thanks", "Shall I book it? 🙂")).toBe(false);
    expect(isTrivialChatMessage("thanks", "Done. The invoice is on its way.")).toBe(true);
  });

  it("selects ride tools for travel requests", () => {
    expect(isTravelRequest("How do I get from Accra to Tema?")).toBe(true);
    expect(isTravelRequest("What is on my calendar today?")).toBe(false);
  });

  it("keeps ride tools for the rest of a ride conversation", () => {
    const turns = [
      { role: "user", content: "How much is a ride from Osu to Tema?" },
      { role: "assistant", content: "Which Osu: Osu Oxford Street or Osu Castle?" },
      { role: "user", content: "Oxford Street" },
    ];
    expect(isTravelRequest("Oxford Street")).toBe(false);
    expect(isTravelConversation(turns)).toBe(true);
    expect(isTravelConversation([{ role: "user", content: "What's on my calendar?" }])).toBe(false);
  });
});
