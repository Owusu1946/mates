import { describe, expect, it } from "vitest";
import { executePlan, extractLinks, planCard, planHash, planSchema, toolkitOf, type Plan } from "./plans.js";

const plan: Plan = planSchema.parse({
  summary: "Set up the budget review Ama asked for.",
  actions: [
    {
      kind: "app",
      id: "a1",
      title: "Create “Budget review” with Ama + Google Meet",
      tool_slug: "GOOGLECALENDAR_CREATE_EVENT",
      arguments: { summary: "Budget review", create_meeting_room: true, timezone: "Africa/Accra" },
      details: [{ label: "When", value: "Tue 14 Nov, 15:00–15:30 (Accra)" }],
    },
    { kind: "reminder", id: "r1", title: "Budget review in 10 minutes", remind_at: "2030-11-14T14:50:00+00:00", link_from: "a1" },
  ],
});

describe("plans", () => {
  it("rejects plans the server could not run safely", () => {
    expect(planSchema.safeParse({ summary: "x", actions: [] }).success).toBe(false);
    expect(planSchema.safeParse({ summary: "x", actions: [{ kind: "app", id: "a1", title: "t", tool_slug: "lower_case", arguments: {} }] }).success).toBe(false);
    const duplicate = { kind: "reminder", id: "r1", title: "t", remind_at: "2030-01-01T00:00:00Z" };
    expect(planSchema.safeParse({ summary: "x", actions: [duplicate, duplicate] }).success).toBe(false);
  });

  it("ties approval to the exact plan", () => {
    expect(planHash(plan)).toBe(planHash(structuredClone(plan)));
    const edited = structuredClone(plan);
    (edited.actions[0] as { arguments: Record<string, unknown> }).arguments.summary = "Something else";
    expect(planHash(edited)).not.toBe(planHash(plan));
  });

  it("shows a reviewable card, then each action's outcome", () => {
    const apps = new Map([["googlecalendar", { name: "Google Calendar", logo: "logo.png" }]]);
    const proposed = planCard(plan, apps);
    expect(proposed).toMatchObject({ kind: "plan", phase: "waiting", label: "Review the plan" });
    expect(proposed.plan!.actions.map((a) => [a.app, a.status])).toEqual([["Google Calendar", "proposed"], ["Reminder", "proposed"]]);
    const done = planCard(plan, apps, [{ id: "a1", status: "done", links: [{ label: "Join Meet", url: "https://meet.google.com/x" }] }, { id: "r1", status: "failed", error: "late" }]);
    expect(done.phase).toBe("error");
    expect(done.plan!.actions[0]!.links).toEqual([{ label: "Join Meet", url: "https://meet.google.com/x" }]);
    expect(planCard(plan, apps, [], undefined, true).plan!.actions.every((a) => a.status === "skipped")).toBe(true);
  });

  it("finds the links a user wants in an app result", () => {
    const links = extractLinks({ data: { response_data: { hangoutLink: "https://meet.google.com/abc", htmlLink: "https://calendar.google.com/e", url: "http://insecure" } } });
    expect(Object.fromEntries(links)).toEqual({ "Join Meet": "https://meet.google.com/abc", "Open in Calendar": "https://calendar.google.com/e" });
    expect(toolkitOf("GOOGLECALENDAR_CREATE_EVENT")).toBe("googlecalendar");
  });

  it("runs only approved actions and skips reminders whose event did not run", async () => {
    const progress: string[] = [];
    const results = await executePlan({
      plan,
      approved: new Set(["r1"]),
      session: undefined as never,
      userId: "user_1",
      chatId: null,
      onProgress: (_, running) => progress.push(running ?? "end"),
    });
    expect(results).toEqual([
      { id: "a1", status: "skipped" },
      { id: "r1", status: "skipped", error: "Its event was not created." },
    ]);
    expect(progress).toEqual(["r1", "end"]);
  });
});
