import { describe, expect, it } from "vitest";
import { shouldHandoffBeforeTool } from "./run-handoff.js";

describe("worker-only live chat tools", () => {
  it.each(["cooper_ship_code", "computer_use", "cooper_make_deck", "cooper_edit_deck", "browser_search", "browser_open", "browser_click", "cooper_join_meeting"])("hands %s to the worker before execution", (name) => {
    expect(shouldHandoffBeforeTool(name)).toBe(true);
  });

  it.each(["web_search", "gmail_search", "cooper_recall"])("keeps short %s work on the live executor", (name) => {
    expect(shouldHandoffBeforeTool(name)).toBe(false);
  });
});
