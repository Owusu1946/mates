import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: () => ({}) }));

const { afterEventHabits, findCandidates, nextDue, timeHabit, topicWeights, whenText } = await import("./miner.js");
const { mailTaskKey } = await import("./observers.js");
const { findItems, prepFromEvent } = await import("./prep.js");
const { toolsUsed } = await import("./activity.js");

type Kind = "ask" | "app_action" | "app_event" | "call" | "meeting" | "read";
const ev = (iso: string, extra: { kind?: Kind; taskKey?: string | null; topic?: string | null; slug?: string | null; mateId?: string | null } = {}) => ({
  at: new Date(iso),
  timezone: "Africa/Accra",
  kind: extra.kind ?? ("ask" as Kind),
  taskKey: extra.taskKey === undefined ? "plan_week" : extra.taskKey,
  label: "Plan the week",
  slug: extra.slug ?? null,
  topic: extra.topic ?? null,
  mateId: extra.mateId ?? "mate_1",
});

// Accra is UTC+0 all year, so these times are local times too. 2026-10-12 is a Monday.
const mondays = ["2026-10-12T09:05:00Z", "2026-10-19T08:40:00Z", "2026-10-26T09:20:00Z", "2026-11-02T09:00:00Z", "2026-11-09T08:55:00Z"];
const now = new Date("2026-11-13T12:00:00Z");

describe("time habits", () => {
  it("finds a task done on 5 Mondays around 9", () => {
    const habit = timeHabit("plan_week", mondays.map((at) => ev(at)), now)!;
    expect(habit.trigger).toMatchObject({ type: "time", dows: [1], tz: "Africa/Accra" });
    // Offered a little before they usually get to it.
    expect(habit.trigger.type === "time" && habit.trigger.hour * 60 + habit.trigger.minute).toBeLessThanOrEqual(9 * 60);
    expect(habit.score).toBeGreaterThanOrEqual(0.8);
    expect(habit.evidence).toMatchObject({ count: 5, weeks: 5 });
    expect(habit.mateId).toBe("mate_1");
  });

  it("ignores two random days", () => {
    expect(timeHabit("plan_week", [ev("2026-10-14T15:00:00Z"), ev("2026-11-06T07:00:00Z")], now)).toBeNull();
  });

  it("needs at least two different weeks", () => {
    expect(timeHabit("plan_week", ["2026-11-09T09:00:00Z", "2026-11-10T09:00:00Z", "2026-11-11T09:00:00Z"].map((at) => ev(at)), now)).toBeNull();
  });

  it("ignores a task done at all hours", () => {
    expect(timeHabit("plan_week", ["2026-10-12T06:00:00Z", "2026-10-19T11:00:00Z", "2026-10-26T16:00:00Z", "2026-11-02T21:00:00Z"].map((at) => ev(at)), now)).toBeNull();
  });

  it("counts a day once, by its first time", () => {
    const twice = [...mondays.map((at) => ev(at)), ev("2026-11-09T17:00:00Z")];
    expect(timeHabit("plan_week", twice, now)!.evidence.count).toBe(5);
  });

  it("works out when it next comes round, in its timezone", () => {
    expect(nextDue({ type: "time", dows: [1], hour: 8, minute: 55, tz: "Africa/Accra" }, now)!.toISOString()).toBe("2026-11-16T08:55:00.000Z");
    expect(nextDue({ type: "after_event", kind: "meeting", match: "", withinMinutes: 60 }, now)).toBeNull();
  });

  it("says when in plain words", () => {
    expect(whenText({ type: "time", dows: [1], hour: 8, minute: 55, tz: "Africa/Accra" })).toBe("Mondays around 08:55");
    expect(whenText({ type: "time", dows: [1, 2, 3, 4, 5], hour: 9, minute: 0, tz: "Africa/Accra" })).toBe("Weekdays around 09:00");
    expect(whenText({ type: "after_event", kind: "meeting", match: "", withinMinutes: 60 })).toBe("after a meeting");
  });
});

describe("follow-up habits", () => {
  const meetings = ["2026-10-20T10:00:00Z", "2026-10-27T10:00:00Z", "2026-11-03T10:00:00Z", "2026-11-10T10:00:00Z"];

  it("finds a task that follows most meetings", () => {
    const events = [
      ...meetings.map((at) => ev(at, { kind: "meeting", taskKey: null })),
      ...meetings.slice(0, 3).map((at) => ev(new Date(new Date(at).getTime() + 40 * 60_000).toISOString(), { taskKey: "email_recap" })),
    ];
    const [habit] = afterEventHabits(events);
    expect(habit).toMatchObject({ taskKey: "email_recap", trigger: { type: "after_event", kind: "meeting", match: "", withinMinutes: 45 } });
    expect(habit!.evidence.count).toBe(3);
  });

  it("ignores one that follows under 60% of them", () => {
    const events = [
      ...meetings.map((at) => ev(at, { kind: "meeting", taskKey: null })),
      ...["2026-10-20T10:30:00Z", "2026-10-27T10:30:00Z"].map((at) => ev(at, { taskKey: "email_recap" })),
    ];
    expect(afterEventHabits(events)).toEqual([]);
  });

  it("counts mail you sent after meetings, not mail after mail", () => {
    const events = [
      ...meetings.map((at) => ev(at, { kind: "meeting", taskKey: null })),
      ...meetings.map((at) => ev(new Date(new Date(at).getTime() + 20 * 60_000).toISOString(), { kind: "app_event", slug: "GMAIL_SENT", taskKey: "email_acme" })),
    ];
    const found = afterEventHabits(events);
    expect(found.map((h) => h.taskKey)).toEqual(["email_acme"]);
    expect(found[0]!.trigger).toMatchObject({ kind: "meeting" });
  });
});

describe("topics", () => {
  it("follows a topic seen 3 times on different days, and offers a digest when it's at a regular time", () => {
    const reads = ["2026-11-03T07:30:00Z", "2026-11-05T07:40:00Z", "2026-11-10T07:35:00Z", "2026-11-12T07:30:00Z"].map((at) => ev(at, { kind: "read", taskKey: null, topic: "fintech in ghana" }));
    expect(topicWeights(reads, now).get("fintech in ghana")!.weight).toBeGreaterThan(2);
    expect(findCandidates(reads, now).map((c) => c.taskKey)).toContain("follow_fintech_in_ghana");
  });

  it("ignores a topic seen once", () => {
    expect(topicWeights([ev("2026-11-10T07:30:00Z", { topic: "arsenal" })], now).size).toBe(0);
  });
});

describe("what's recorded", () => {
  it("lists the tools a run used, including apps called through Composio", () => {
    const messages = [
      { role: "assistant", tool_calls: [{ function: { name: "COMPOSIO_MULTI_EXECUTE_TOOL", arguments: JSON.stringify({ tools: [{ tool_slug: "GMAIL_SEND_EMAIL" }, { tool_slug: "GOOGLECALENDAR_EVENTS_LIST" }] }) } }] },
      { role: "assistant", tool_calls: [{ function: { name: "cooper_web_search", arguments: "{}" } }, { function: { name: "COMPOSIO_SEARCH_TOOLS", arguments: "{}" } }] },
    ];
    expect(toolsUsed(messages)).toEqual(["GMAIL_SEND_EMAIL", "GOOGLECALENDAR_EVENTS_LIST", "cooper_web_search"]);
  });

  it("keeps who mail went to as a short key, never the address", () => {
    expect(mailTaskKey("Kofi <kofi@acme.com>")).toBe("email_acme");
    expect(mailTaskKey("ama.mensah@gmail.com")).toBe("email_ama");
    expect(mailTaskKey("not an address")).toBeNull();
  });
});

describe("meeting prep", () => {
  const base = { id: "e1", summary: "Acme sync", start: { dateTime: "2026-11-13T14:00:00Z" }, attendees: [{ email: "me@x.com", self: true }, { email: "Kofi@Acme.com", displayName: "Kofi" }] };

  it("preps timed meetings with someone else", () => {
    expect(prepFromEvent({ ...base, hangoutLink: "https://meet.google.com/abc-defg-hij" })).toMatchObject({ eventId: "e1", title: "Acme sync", attendees: [{ name: "Kofi", email: "kofi@acme.com" }], meetingUrl: "https://meet.google.com/abc-defg-hij" });
  });

  it("finds a Zoom link in the description", () => {
    expect(prepFromEvent({ ...base, description: "Join: https://us02web.zoom.us/j/123456?pwd=x thanks" })!.meetingUrl).toBe("https://us02web.zoom.us/j/123456?pwd=x");
  });

  it("skips all-day, cancelled, declined, solo and room-only events", () => {
    expect(prepFromEvent({ ...base, start: { date: "2026-11-13" } })).toBeNull();
    expect(prepFromEvent({ ...base, status: "cancelled" })).toBeNull();
    expect(prepFromEvent({ ...base, attendees: [{ email: "me@x.com", self: true, responseStatus: "declined" }, { email: "k@acme.com" }] })).toBeNull();
    expect(prepFromEvent({ ...base, attendees: [{ email: "me@x.com", self: true }] })).toBeNull();
    expect(prepFromEvent({ ...base, attendees: [{ email: "me@x.com", self: true }, { email: "room@resource.calendar.google.com", resource: true }] })).toBeNull();
  });

  it("finds the events however deep the tool output nests them", () => {
    const output = { data: { results: [{ response: { data: { items: [base, { id: "e2", start: { dateTime: "x" } }] } } }] } };
    expect(findItems(output, (i) => typeof i.start === "object" && "id" in i).map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});
