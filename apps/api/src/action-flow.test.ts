import { describe, expect, it } from "vitest";
import { actionTier, batchTier, cleanArguments, describeAction, undoFor } from "./action-policy.js";
import { recoverLeakedCalls } from "./tool-recovery.js";

const tools = new Set(["COMPOSIO_MULTI_EXECUTE_TOOL", "cooper_propose_plan"]);

describe("leaked tool calls", () => {
  it("recovers a call the model wrote as text, as seen on device", () => {
    const text = `I'm checking your calendar before selecting a time.\n\nto=functions.COMPOSIO_MULTI_EXECUTE_TOOL  code ойоштор Урыстәjson {“tools”:[{“tool_slug”:“GOOGLECALENDAR_FIND_FREE_SLOTS”,“arguments”:{“items”:[“primary”],“timezone”:“Africa/Accra”}}],“thought”:“Checking {availability}”} મેળવ\n\nDone.`;
    const { found, calls, text: cleaned } = recoverLeakedCalls(text, tools);
    expect(found).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.function.name).toBe("COMPOSIO_MULTI_EXECUTE_TOOL");
    expect(JSON.parse(calls[0]!.function.arguments).tools[0].tool_slug).toBe("GOOGLECALENDAR_FIND_FREE_SLOTS");
    expect(cleaned).toBe("I'm checking your calendar before selecting a time.\n\nDone.");
  });

  it("drops unknown or unreadable calls but still strips them", () => {
    const { found, calls, text } = recoverLeakedCalls('to=functions.rm_rf {"path":"/"} and to=functions.cooper_propose_plan {"summary": broken', tools);
    expect(found).toBe(true);
    expect(calls).toEqual([]);
    expect(text).toBe("and");
  });

  it("leaves ordinary replies alone", () => {
    expect(recoverLeakedCalls("Your meeting is set for 3 PM.", tools)).toEqual({ found: false, text: "Your meeting is set for 3 PM.", calls: [] });
  });
});

describe("action policy", () => {
  it("never asks: every change runs, and only reads are told apart", () => {
    expect(actionTier("GMAIL_FETCH_EMAILS")).toBe("read");
    expect(actionTier("GOOGLECALENDAR_CREATE_EVENT")).toBe("write");
    expect(actionTier("GMAIL_REPLY_TO_THREAD")).toBe("write");
    expect(actionTier("GMAIL_SEND_EMAIL")).toBe("write");
    expect(batchTier(["GMAIL_FETCH_EMAILS", "GOOGLECALENDAR_FIND_FREE_SLOTS"])).toBe("read");
    expect(batchTier(["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"])).toBe("write");
  });

  it("strips the empty values that made the first calendar attempt fail", () => {
    expect(
      cleanArguments({ summary: "Q4 budget review", start_date: "", end_date: "", recurrence: [], birthdayProperties: {}, create_meeting_room: true, event_duration_hour: 0, nested: { a: "", b: 1 } }),
    ).toEqual({ summary: "Q4 budget review", create_meeting_room: true, event_duration_hour: 0, nested: { b: 1 } });
  });

  it("describes actions in plain language, never as arguments", () => {
    const event = describeAction("GOOGLECALENDAR_CREATE_EVENT", {
      summary: "Q4 budget review",
      start_datetime: "2026-11-10T15:00:00+00:00",
      end_datetime: "2026-11-10T15:30:00+00:00",
      timezone: "Africa/Accra",
      attendees: ["ama@example.com"],
      create_meeting_room: true,
    }, true);
    expect(event.title).toBe("Created “Q4 budget review”");
    expect(event.details.map((d) => d.label)).toEqual(["When", "Guests", "Video"]);
    expect(event.details[0]!.value).toContain("15:00");
    expect(describeAction("GMAIL_SEND_EMAIL", { recipient_email: "a@b.co", subject: "Hi" }).title).toBe("Send an email");
  });

  it("knows how to undo what it does without asking", () => {
    expect(undoFor("GOOGLECALENDAR_CREATE_EVENT", {}, { data: { response_data: { id: "evt123", hangoutLink: "https://meet.google.com/x" } } })).toEqual({
      tool_slug: "GOOGLECALENDAR_DELETE_EVENT",
      arguments: { event_id: "evt123", calendar_id: "primary", send_updates: "all" },
    });
    expect(undoFor("GMAIL_SEND_EMAIL", {}, { id: "m1" })).toBeNull();
  });
});
