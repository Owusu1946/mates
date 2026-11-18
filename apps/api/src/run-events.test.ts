import { describe, expect, it } from "vitest";
import { encodeRunEvent, parseRunEventCursor, runStreamEventSchema, terminalRunStatus } from "./run-events.js";

describe("run event stream protocol", () => {
  it("prefers Last-Event-ID and accepts only safe nonnegative integer cursors", () => {
    expect(parseRunEventCursor("4", "7")).toBe(7);
    expect(parseRunEventCursor("4", undefined)).toBe(4);
    expect(parseRunEventCursor(undefined, "-1")).toBeNull();
    expect(parseRunEventCursor(undefined, "9007199254740992")).toBeNull();
  });

  it("encodes a typed event with a replayable SSE id", () => {
    const event = { version: 1 as const, sequence: 3, type: "progress" as const, timestamp: "2026-11-18T12:00:00.000Z", payload: { status: "running" } };
    expect(runStreamEventSchema.parse(event)).toEqual(event);
    expect(new TextDecoder().decode(encodeRunEvent(event))).toBe(`id: 3\nevent: progress\ndata: ${JSON.stringify(event)}\n\n`);
  });

  it("closes the stream only after a run becomes terminal", () => {
    expect(terminalRunStatus("running")).toBe(false);
    expect(terminalRunStatus("completed")).toBe(true);
    expect(terminalRunStatus("waiting")).toBe(true);
  });

  it("rejects unknown event types", () => {
    expect(() => runStreamEventSchema.parse({ version: 1, sequence: 1, type: "unknown", timestamp: "2026-11-18T12:00:00.000Z", payload: {} })).toThrow();
  });
});
