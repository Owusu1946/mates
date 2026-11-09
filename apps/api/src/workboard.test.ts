import { describe, expect, it } from "vitest";
import type { PersonaMate } from "./mates.js";
import { boardCard, boardView, leaderStepOf, LIMITS, normaliseDecision, orphanedTasks, ownerFor, readyTasks, stuckTasks, taskBrief, type BoardTask, type RawDecision } from "./workboard.js";

const mate = (id: string, name: string, roleDescription: string): PersonaMate => ({ id, name, role: "custom", roleDescription, color: "teal", shape: "hexagon" });
const kojo = mate("lead", "Kojo", "chief of staff");
const nova = mate("nova", "Nova", "researcher: market research, competitors, prices and sources");
const sol = mate("sol", "Sol", "engineer: builds websites, landing pages and code");
const ivy = mate("ivy", "Ivy", "writer: brand voice, copy, emails and posts");
const team = [kojo, nova, sol, ivy];

let n = 0;
const task = (fields: Partial<BoardTask>): BoardTask => ({ id: `task${++n}`, mateId: "nova", title: `Task ${n}`, objective: "Do it", doneWhen: "", dependsOn: [], status: "queued", attempts: 0, revisions: 0, feedback: null, position: n, ...fields });
const decision = (fields: Partial<RawDecision>): RawDecision => ({ action: "continue", handoff: "", question: "", final_task: "", new_tasks: [], reviews: [], ...fields });
const newTask = (fields: Partial<RawDecision["new_tasks"][number]>) => ({ key: "t1", title: "Research competitors", objective: "Find 5 competitors with prices", done_when: "5 named, with links", mate_id: "nova", depends_on: [], ...fields });

describe("the leader never does the team's work", () => {
  it("hands a task the leader gave itself to the teammate whose role fits", () => {
    const result = normaliseDecision(decision({ new_tasks: [newTask({ mate_id: "lead", title: "Build the landing page", objective: "Code the website" })] }), { members: team, leaderId: "lead", tasks: [] });
    expect(result.newTasks[0]!.mateId).toBe("sol");
  });

  it("does the work itself only when it has no teammates", () => {
    expect(ownerFor("lead", "anything", [kojo], "lead", new Map())).toBe("lead");
    expect(ownerFor(undefined, "anything", [kojo], "lead", new Map())).toBe("lead");
  });

  it("routes unknown owners by role, and spreads equal fits by workload", () => {
    expect(ownerFor("ghost", "write the launch email copy", team, "lead", new Map())).toBe("ivy");
    expect(ownerFor(undefined, "something unrelated", [kojo, nova, sol], "lead", new Map([["nova", 3]]))).toBe("sol");
  });
});

describe("planning the board", () => {
  it("keeps dependencies that exist and can never loop", () => {
    const existing = task({ id: "done1", status: "done" });
    const cancelled = task({ id: "gone", status: "cancelled" });
    const result = normaliseDecision(
      decision({
        new_tasks: [
          newTask({ key: "a", depends_on: ["done1", "gone", "b", "nope"] }),
          newTask({ key: "b", title: "Build the page", mate_id: "sol", depends_on: ["a", "b"] }),
        ],
      }),
      { members: team, leaderId: "lead", tasks: [existing, cancelled] },
    );
    expect(result.newTasks.map((t) => [t.key, t.dependsOn])).toEqual([["a", ["done1"]], ["b", ["a"]]]);
  });

  it("caps the board and the tasks added in one round", () => {
    const many = Array.from({ length: 10 }, (_, i) => newTask({ key: `k${i}`, title: `Job ${i}` }));
    expect(normaliseDecision(decision({ new_tasks: many }), { members: team, leaderId: "lead", tasks: [] }).newTasks).toHaveLength(LIMITS.newPerRound);
    const full = Array.from({ length: LIMITS.tasks - 1 }, (_, i) => task({ title: `Existing ${i}`, status: "done" }));
    expect(normaliseDecision(decision({ new_tasks: many }), { members: team, leaderId: "lead", tasks: full }).newTasks).toHaveLength(1);
  });

  it("keeps task titles unique, since each result is saved under its title", () => {
    const result = normaliseDecision(decision({ new_tasks: [newTask({ key: "a", title: "Research" }), newTask({ key: "b", title: "research" })] }), { members: team, leaderId: "lead", tasks: [task({ title: "Research", status: "done" })] });
    expect(result.newTasks.map((t) => t.title)).toEqual(["Research (2)", "research (3)"]);
  });
});

describe("running in parallel", () => {
  it("starts every ready task at once, up to the limit, one per mate", () => {
    const tasks = [task({ mateId: "nova" }), task({ mateId: "nova" }), task({ mateId: "sol" }), task({ mateId: "ivy" }), task({ mateId: "lead" })];
    const ready = readyTasks(tasks);
    expect(ready.map((t) => t.mateId)).toEqual(["nova", "sol", "ivy"]);
    expect(ready).toHaveLength(LIMITS.parallel);
  });

  it("waits for dependencies, and counts mates already working", () => {
    const research = task({ id: "r", mateId: "nova", status: "working" });
    const page = task({ mateId: "sol", dependsOn: ["r"] });
    const copy = task({ mateId: "ivy" });
    expect(readyTasks([research, page, copy], 2).map((t) => t.id)).toEqual([copy.id]);
    expect(readyTasks([{ ...research, status: "done" }, page, copy]).map((t) => t.id)).toEqual([page.id, copy.id]);
  });

  it("spots tasks that can never start because what they wait on failed", () => {
    const broken = task({ id: "x", status: "failed" });
    const blocked = task({ dependsOn: ["x"] });
    expect(stuckTasks([broken, blocked, task({})]).map((t) => t.id)).toEqual([blocked.id]);
  });
});

describe("reviewing results", () => {
  it("accepts, sends back, reassigns to someone else, or cancels", () => {
    const a = task({ status: "review" });
    const b = task({ status: "review" });
    const c = task({ status: "review", mateId: "nova", title: "Write the page copy", objective: "Copy for the site" });
    const d = task({ status: "queued" });
    const result = normaliseDecision(
      decision({
        reviews: [
          { task_id: a.id, verdict: "accept", feedback: "Great", mate_id: "" },
          { task_id: b.id, verdict: "revise", feedback: "Add prices in cedis", mate_id: "" },
          { task_id: c.id, verdict: "reassign", feedback: "Better for a writer", mate_id: "nova" },
          { task_id: d.id, verdict: "cancel", feedback: "Not needed", mate_id: "" },
        ],
      }),
      { members: team, leaderId: "lead", tasks: [a, b, c, d] },
    );
    expect(result.reviews.map((r) => [r.verdict, r.mateId])).toEqual([["accept", undefined], ["revise", undefined], ["reassign", "ivy"], ["cancel", undefined]]);
  });

  it("never loops on one task: past the revision cap, the best effort stands", () => {
    const worn = task({ status: "review", revisions: LIMITS.revisions });
    const result = normaliseDecision(decision({ reviews: [{ task_id: worn.id, verdict: "revise", feedback: "Again", mate_id: "" }] }), { members: team, leaderId: "lead", tasks: [worn, task({})] });
    expect(result.reviews[0]!.verdict).toBe("accept");
  });

  it("ignores reviews of tasks that aren't waiting for one", () => {
    const working = task({ status: "working" });
    expect(normaliseDecision(decision({ reviews: [{ task_id: working.id, verdict: "accept", feedback: "", mate_id: "" }] }), { members: team, leaderId: "lead", tasks: [working] }).reviews).toEqual([]);
  });
});

describe("deciding what's next", () => {
  it("finishes only when nothing is left open", () => {
    const open = task({ status: "queued" });
    expect(normaliseDecision(decision({ action: "finish" }), { members: team, leaderId: "lead", tasks: [open] }).action).toBe("continue");
    const done = [task({ status: "done" }), task({ status: "cancelled" })];
    expect(normaliseDecision(decision({ action: "finish" }), { members: team, leaderId: "lead", tasks: done })).toMatchObject({ action: "finish", finalTask: expect.stringContaining("Compile") });
  });

  it("wraps up on its own when every task is done, and asks when it's stuck", () => {
    expect(normaliseDecision(decision({}), { members: team, leaderId: "lead", tasks: [task({ status: "done" })] }).action).toBe("finish");
    expect(normaliseDecision(decision({}), { members: team, leaderId: "lead", tasks: [task({ status: "failed" })] }).action).toBe("checkin");
  });

  it("asks the user only with a real question", () => {
    expect(normaliseDecision(decision({ action: "checkin", question: "Which name: Jollof Box or Pot Club?" }), { members: team, leaderId: "lead", tasks: [] })).toMatchObject({ action: "checkin", question: "Which name: Jollof Box or Pot Club?" });
    expect(normaliseDecision(decision({ action: "checkin", new_tasks: [newTask({})] }), { members: team, leaderId: "lead", tasks: [] }).action).toBe("continue");
  });
});

describe("keeping the board healthy", () => {
  it("gives tasks of a deleted or departed mate to someone still on the team", () => {
    const orphan = task({ mateId: "gone", title: "Build the landing page", objective: "Code the site" });
    const unowned = task({ mateId: null, title: "Draft the email copy", objective: "Write it" });
    expect(orphanedTasks([orphan, unowned, task({ mateId: "nova" })], team, "lead")).toEqual([{ id: orphan.id, mateId: "sol" }, { id: unowned.id, mateId: "ivy" }]);
  });

  it("briefs a mate with its task alone, what it builds on in full, and the lead's notes", () => {
    const brief = taskBrief({ goal: "Launch Jollof Box", task: task({ title: "Landing page", objective: "Build it", doneWhen: "Has 3 tiers", feedback: "Add a WhatsApp button" }), inputs: [{ title: "Pricing", content: "Basic GH₵150" }] });
    expect(brief).toContain("Your task: Landing page");
    expect(brief).toContain("Done when: Has 3 tiers");
    expect(brief).toContain("Add a WhatsApp button");
    expect(brief).toContain("### Pricing\nBasic GH₵150");
    expect(brief).toContain("Do only this task");
  });

  it("shows revisions as 'changes', hides cancelled tasks, and carries each mate's current step", () => {
    const revising = task({ status: "queued", revisions: 1, mateId: "sol" });
    const card = boardCard(kojo, team, [revising, task({ status: "cancelled" }), task({ status: "working", id: "w" })], 3, new Map([["w", "Searching for prices…"]]));
    expect(card.handoff!.items.map((i) => i.status)).toEqual(["changes", "working"]);
    expect(card.handoff!.items[1]!.step).toBe("Searching for prices…");
    expect(card.label).toBe("Round 3");
  });

  it("shows the pinned board: owners, live steps for working tasks, timing, cancelled tasks hidden", () => {
    const started = new Date("2026-11-10T08:00:00Z");
    const tasks = [
      { ...task({ id: "a", status: "working", mateId: "nova" }), startedAt: started, finishedAt: null },
      { ...task({ id: "b", status: "queued", revisions: 1, mateId: "ghost" }), startedAt: null, finishedAt: null },
      { ...task({ id: "c", status: "cancelled" }), startedAt: null, finishedAt: null },
    ];
    const view = boardView(tasks, new Map([["nova", { id: "nova", name: "Nova", color: "blue", shape: "circle" }]]), new Map([["a", "Reading 4 sources…"], ["b", "stale"]]));
    expect(view.map((t) => [t.id, t.status, t.mate?.name ?? null, t.step])).toEqual([["a", "working", "Nova", "Reading 4 sources…"], ["b", "changes", null, null]]);
    expect(view[0]!.startedAt).toBe("2026-11-10T08:00:00.000Z");
    expect(view[0]!.mate?.gradient).toHaveLength(3);
  });

  it("reads the leader's live status while it reviews or plans, and nothing once it's done", () => {
    const part = (phase: string) => [{ type: "tool-call", toolCallId: "leader_status_r1", result: { kind: "step", phase, label: "Kojo is reviewing the team’s work…" } }];
    expect(leaderStepOf(part("running"))).toBe("Kojo is reviewing the team’s work…");
    expect(leaderStepOf(part("done"))).toBeNull();
    expect(leaderStepOf([])).toBeNull();
  });
});
