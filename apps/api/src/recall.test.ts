import { describe, expect, it } from "vitest";
import { recallContext, runRecall } from "./recall.js";

describe("recall", () => {
  it("does nothing without a message to search with", async () => {
    expect(await recallContext("user_1", null)).toBeNull();
    expect(await runRecall("user_1", "   ")).toEqual({ error: "Say what to look for." });
    expect(await runRecall("user_1", 42)).toEqual({ error: "Say what to look for." });
  });
});
