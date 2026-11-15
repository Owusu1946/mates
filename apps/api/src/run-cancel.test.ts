import { describe, expect, it } from "vitest";
import { CANCELLED_STATUS, cancelledMessage, stoppedContent } from "./run-cancel.js";

const card = (phase: string, label = "Searching") => ({ type: "tool-call", toolCallId: "t1", toolName: "cooper_workflow", args: {}, argsText: "{}", result: { kind: "step", phase, label, detail: "the web" } });

describe("a stopped reply", () => {
  it("turns only spinning cards into Stopped and keeps what arrived", () => {
    const content = [{ type: "text", text: "Here’s what I found so far" }, card("running"), card("done", "Read 3 pages")];
    const stopped = stoppedContent(content);
    expect(stopped[0]).toEqual(content[0]);
    expect(stopped[1]!.result).toMatchObject({ kind: "step", phase: "error", label: "Stopped" });
    expect((stopped[1]!.result as { detail?: string }).detail).toBeUndefined();
    expect(stopped[2]).toEqual(content[2]);
  });

  it("marks the saved message cancelled", () => {
    const message = cancelledMessage({ id: "a1", role: "assistant", content: [card("running")], status: { type: "running" } });
    expect(message.status).toEqual(CANCELLED_STATUS);
    expect((message.content as { result: { label: string } }[])[0]!.result.label).toBe("Stopped");
    expect(message.id).toBe("a1");
  });

  it("leaves a message without content alone apart from its status", () => {
    expect(cancelledMessage({ id: "a2" })).toEqual({ id: "a2", content: undefined, status: CANCELLED_STATUS });
  });
});
