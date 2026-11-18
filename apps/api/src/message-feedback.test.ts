import { describe, expect, it } from "vitest";
import { isMessageFeedbackReady, messageFeedbackAttribution, messageFeedbackInputSchema } from "./message-feedback.js";

const runId = "11111111-2222-4333-8444-555555555555";

describe("message feedback contract", () => {
  it("accepts positive feedback without negative details", () => {
    expect(messageFeedbackInputSchema.parse({ rating: "up" })).toEqual({ rating: "up" });
  });

  it("requires one of the defined reasons for a negative rating", () => {
    expect(messageFeedbackInputSchema.safeParse({ rating: "down" }).success).toBe(false);
    expect(messageFeedbackInputSchema.safeParse({ rating: "down", reason: "other", note: "  Slow reply  " })).toMatchObject({
      success: true,
      data: { rating: "down", reason: "other", note: "Slow reply" },
    });
    expect(messageFeedbackInputSchema.safeParse({ rating: "down", reason: "not-a-reason" }).success).toBe(false);
  });

  it("bounds notes and rejects negative details on a positive rating", () => {
    expect(messageFeedbackInputSchema.safeParse({ rating: "down", reason: "other", note: "x".repeat(1_001) }).success).toBe(false);
    expect(messageFeedbackInputSchema.safeParse({ rating: "up", reason: "other" }).success).toBe(false);
  });

  it("rejects feedback while either the message or its run is active", () => {
    expect(isMessageFeedbackReady({ status: { type: "running" } })).toBe(false);
    expect(isMessageFeedbackReady({ status: { type: "complete" } }, "queued")).toBe(false);
    expect(isMessageFeedbackReady({ status: { type: "complete" } }, "running")).toBe(false);
    expect(isMessageFeedbackReady({ status: { type: "complete" } }, "completed")).toBe(true);
  });

  it("uses the run id saved on the message and attributes a group only when it has one speaker", () => {
    const message = {
      metadata: { custom: { delegationId: runId } },
      content: [{ type: "tool-call", result: { kind: "speaker", speaker: { id: "mate-a" } } }],
    };
    expect(messageFeedbackAttribution(message, "group", null)).toEqual({ runId, mateId: "mate-a" });
    expect(messageFeedbackAttribution({
      ...message,
      content: [...message.content, { type: "tool-call", result: { kind: "speaker", speaker: { id: "mate-b" } } }],
    }, "group", null)).toEqual({ runId, mateId: null });
    expect(messageFeedbackAttribution({}, "mate", "mate-primary")).toEqual({ runId: null, mateId: "mate-primary" });
    expect(messageFeedbackAttribution({ metadata: { custom: { delegationId: "invalid" } } }, "legacy", null).runId).toBeNull();
  });
});
