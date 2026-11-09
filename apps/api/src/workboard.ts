import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { missionNotes, missionTasks } from "./db/schema.js";
import type { WorkflowCard } from "./integrations.js";
import { gradientOf, type PersonaMate } from "./mates.js";
import type { Mission } from "./missions.js";
import { CHAT_MODEL } from "./models.js";

/**
 * The mission's work board. The leader is a chief of staff: it breaks the goal into tasks, hands
 * each to the mate whose role fits, reviews what comes back and decides what's next. Mates do
 * the work, side by side when tasks don't depend on each other. Code enforces the roles: the
 * leader never owns a task while it has teammates, whatever the plan says.
 */

export const LIMITS = {
  /** Tasks on one mission's board, so a mission can't grow without end. */
  tasks: 14,
  newPerRound: 6,
  /** Mates working at the same time in one round. */
  parallel: 3,
  /** Times the leader can send one task back for changes before accepting the best effort. */
  revisions: 2,
  /** Runs per task that error or time out before it's marked failed for the leader to handle. */
  attempts: 2,
  /** Rounds before the leader must check in with the user rather than keep going. */
  rounds: 40,
  /** One task's run; the whole round stays inside the worker's 10-minute limit. */
  taskMs: 7 * 60_000,
} as const;

export type TaskStatus = (typeof missionTasks.$inferSelect)["status"];
export type BoardTask = Pick<typeof missionTasks.$inferSelect, "id" | "mateId" | "title" | "objective" | "doneWhen" | "dependsOn" | "status" | "attempts" | "revisions" | "feedback" | "position">;

const OPEN: TaskStatus[] = ["queued", "working", "review", "waiting"];
const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);

/** The teammate whose name and role best match the work, the least busy on a tie. */
export function bestMate(work: string, members: PersonaMate[], leaderId: string, load: Map<string, number>): string {
  const team = members.filter((m) => m.id !== leaderId);
  if (!team.length) return leaderId;
  const wanted = words(work);
  const score = (m: PersonaMate) => [...words(`${m.name} ${m.role} ${m.roleDescription}`)].filter((w) => wanted.has(w)).length;
  return [...team].sort((a, b) => score(b) - score(a) || (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0]!.id;
}

/** Who owns a piece of work: the requested teammate if valid, never the leader while others exist. */
export function ownerFor(requested: string | undefined, work: string, members: PersonaMate[], leaderId: string, load: Map<string, number>, exclude?: string): string {
  const valid = members.some((m) => m.id === requested) && requested !== exclude;
  const hasTeam = members.some((m) => m.id !== leaderId);
  if (valid && (requested !== leaderId || !hasTeam)) return requested!;
  const pick = bestMate(work, exclude ? members.filter((m) => m.id !== exclude) : members, leaderId, load);
  return pick === exclude ? leaderId : pick;
}

/** Open tasks per mate, for spreading new work evenly. */
export function loadOf(tasks: BoardTask[]) {
  const load = new Map<string, number>();
  for (const task of tasks) if (task.mateId && OPEN.includes(task.status)) load.set(task.mateId, (load.get(task.mateId) ?? 0) + 1);
  return load;
}

/** Tasks that can start now: queued, every dependency done, one per mate, within the parallel limit. */
export function readyTasks(tasks: BoardTask[], parallel: number = LIMITS.parallel): BoardTask[] {
  const done = new Set(tasks.filter((t) => t.status === "done").map((t) => t.id));
  const working = tasks.filter((t) => t.status === "working");
  const busy = new Set(working.map((t) => t.mateId));
  const ready: BoardTask[] = [];
  for (const task of [...tasks].sort((a, b) => a.position - b.position)) {
    if (ready.length + working.length >= parallel) break;
    if (task.status !== "queued" || !task.mateId || busy.has(task.mateId)) continue;
    if (!task.dependsOn.every((id) => done.has(id))) continue;
    busy.add(task.mateId);
    ready.push(task);
  }
  return ready;
}

/** Queued tasks that can never start because something they wait on failed or was cancelled. */
export function stuckTasks(tasks: BoardTask[]) {
  const dead = new Set(tasks.filter((t) => t.status === "failed" || t.status === "cancelled").map((t) => t.id));
  return tasks.filter((t) => t.status === "queued" && t.dependsOn.some((id) => dead.has(id)));
}

const decisionSchema = z.object({
  action: z.enum(["continue", "checkin", "finish"]),
  handoff: z.string(),
  question: z.string(),
  final_task: z.string(),
  new_tasks: z.array(z.object({ key: z.string(), title: z.string(), objective: z.string(), done_when: z.string(), mate_id: z.string(), depends_on: z.array(z.string()) })),
  reviews: z.array(z.object({ task_id: z.string(), verdict: z.enum(["accept", "revise", "reassign", "cancel"]), feedback: z.string(), mate_id: z.string() })),
});
export type RawDecision = z.infer<typeof decisionSchema>;

export type NewTask = { key: string; title: string; objective: string; doneWhen: string; mateId: string; dependsOn: string[] };
export type Review = { taskId: string; verdict: "accept" | "revise" | "reassign" | "cancel"; feedback: string; mateId?: string };
export type Decision =
  | { action: "continue"; handoff: string; newTasks: NewTask[]; reviews: Review[] }
  | { action: "checkin"; question: string; handoff: string; newTasks: NewTask[]; reviews: Review[] }
  | { action: "finish"; finalTask: string; handoff: string; newTasks: NewTask[]; reviews: Review[] };

const clip = (text: string, max: number) => text.trim().slice(0, max);

/** The board after this decision's reviews, to check what the decision leaves possible. */
function afterReviews(tasks: BoardTask[], reviews: Review[]): BoardTask[] {
  const byId = new Map(reviews.map((r) => [r.taskId, r]));
  return tasks.map((task) => {
    const review = byId.get(task.id);
    if (!review) return task;
    if (review.verdict === "accept") return { ...task, status: "done" };
    if (review.verdict === "cancel") return { ...task, status: "cancelled" };
    return { ...task, status: "queued", mateId: review.mateId ?? task.mateId };
  });
}

/**
 * Turns the leader's structured answer into a decision the board can apply, never an invalid
 * one: real teammates only (never the leader while it has a team), dependencies that exist and
 * can't loop, capped revisions and board size, and "finish" only when nothing is left open.
 */
export function normaliseDecision(raw: RawDecision, ctx: { members: PersonaMate[]; leaderId: string; tasks: BoardTask[] }): Decision {
  const { members, leaderId, tasks } = ctx;
  const load = loadOf(tasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const reviews: Review[] = [];
  const reviewed = new Set<string>();
  for (const r of raw.reviews) {
    const task = byId.get(r.task_id);
    if (!task || reviewed.has(task.id)) continue;
    // Accepting and cancelling need a result or a reason; sending back needs a review-ready task.
    const reviewable = task.status === "review";
    const retryable = task.status === "failed" || (task.status === "queued" && !task.mateId);
    if (r.verdict === "cancel" && (OPEN.includes(task.status) || task.status === "failed")) {
      reviews.push({ taskId: task.id, verdict: "cancel", feedback: clip(r.feedback, 400) });
    } else if (r.verdict === "accept" && reviewable) {
      reviews.push({ taskId: task.id, verdict: "accept", feedback: clip(r.feedback, 400) });
    } else if (r.verdict === "revise" && reviewable) {
      // Past the cap, the best effort stands: the board never loops on one task.
      reviews.push(task.revisions >= LIMITS.revisions ? { taskId: task.id, verdict: "accept", feedback: clip(r.feedback, 400) } : { taskId: task.id, verdict: "revise", feedback: clip(r.feedback, 600) });
    } else if (r.verdict === "reassign" && (reviewable || retryable)) {
      const mateId = ownerFor(r.mate_id, `${task.title} ${task.objective}`, members, leaderId, load, task.mateId ?? undefined);
      reviews.push({ taskId: task.id, verdict: "reassign", feedback: clip(r.feedback, 600), mateId });
    } else continue;
    reviewed.add(task.id);
  }

  const room = Math.max(0, Math.min(LIMITS.newPerRound, LIMITS.tasks - tasks.length));
  const newTasks: NewTask[] = [];
  const keys = new Set<string>();
  // Each task's result is saved under its title, so titles stay unique on the board.
  const titles = new Set(tasks.map((t) => t.title.toLowerCase()));
  const uniqueTitle = (title: string) => {
    let candidate = title;
    for (let n = 2; titles.has(candidate.toLowerCase()); n++) candidate = `${title} (${n})`;
    titles.add(candidate.toLowerCase());
    return candidate;
  };
  for (const t of raw.new_tasks) {
    if (newTasks.length >= room) break;
    const title = clip(t.title, 80);
    const objective = clip(t.objective, 1_200);
    const key = clip(t.key, 40) || `t${newTasks.length + 1}`;
    if (!title || !objective || keys.has(key)) continue;
    const mateId = ownerFor(t.mate_id, `${title} ${objective}`, members, leaderId, load);
    load.set(mateId, (load.get(mateId) ?? 0) + 1);
    // A new task may wait on existing tasks or on new ones listed before it, so cycles can't form.
    const dependsOn = [...new Set(t.depends_on)].filter((d) => (byId.has(d) && byId.get(d)!.status !== "cancelled") || keys.has(d));
    newTasks.push({ key, title: uniqueTitle(title), objective, doneWhen: clip(t.done_when, 600), mateId, dependsOn });
    keys.add(key);
  }

  const handoff = clip(raw.handoff, 500);
  const after = afterReviews(tasks, reviews);
  const open = after.some((t) => OPEN.includes(t.status) && t.status !== "waiting") || newTasks.length > 0;
  if (raw.action === "checkin" && raw.question.trim()) return { action: "checkin", question: clip(raw.question, 500), handoff, newTasks, reviews };
  if (raw.action === "finish" && !open && !after.some((t) => t.status === "waiting"))
    return { action: "finish", finalTask: clip(raw.final_task, 1_000) || "Compile the final deliverable from the notes and summarise what the team did.", handoff, newTasks: [], reviews };
  if (!open && !after.some((t) => t.status === "waiting")) {
    // Nothing left to do and the leader didn't plan more: wrap up rather than idle.
    return after.length && after.every((t) => t.status === "done" || t.status === "cancelled")
      ? { action: "finish", finalTask: "Compile the final deliverable from the notes and summarise what the team did.", handoff, newTasks: [], reviews }
      : { action: "checkin", question: "The team has no next step it can take on its own. How would you like to proceed?", handoff, newTasks, reviews };
  }
  return { action: "continue", handoff, newTasks, reviews };
}

/** The leader's view of the board for planning and review, results included in full where it matters. */
function boardForLeader(tasks: BoardTask[], members: PersonaMate[], notes: Map<string, string>) {
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? "unassigned";
  if (!tasks.length) return "(no tasks yet: plan the work)";
  return tasks
    .map((t) => {
      const deps = t.dependsOn.length ? ` · after ${t.dependsOn.join(", ")}` : "";
      const head = `- ${t.id} [${t.status}] "${t.title}" · ${name(t.mateId)}${deps}${t.revisions ? ` · revised ${t.revisions}x` : ""}`;
      const result = t.status === "review" ? `\n  Objective: ${t.objective}\n  Done when: ${t.doneWhen || "(not set)"}\n  Result to review:\n${(notes.get(t.title.toLowerCase()) ?? "(no result saved)").slice(0, 6_000)}` : "";
      return head + result;
    })
    .join("\n");
}

/**
 * The leader's one decision per round, as structured output: plan or add tasks, review what came
 * back, and continue, ask the user, or finish. Retries once; null means it couldn't decide.
 */
export async function decideRound(input: { mission: Mission; members: PersonaMate[]; leaderId: string; tasks: BoardTask[]; turns: { role: string; content: string }[] }): Promise<Decision | null> {
  const leader = input.members.find((m) => m.id === input.leaderId) ?? input.members[0]!;
  const notes = await notesByTitle(input.mission.id);
  const roster = input.members.filter((m) => m.id !== leader.id).map((m) => `- ${m.id}: ${m.name} — ${m.roleDescription || m.role}`).join("\n") || "(no teammates: you do the work yourself)";
  const recent = input.turns.slice(-8).map((t) => `${t.role === "user" ? "User" : "Team"}: ${t.content.slice(0, 600)}`).join("\n");
  const system = `You are ${leader.name}, chief of staff leading a team of AI mates on a mission for the user. You never do the work yourself: you plan it, hand each piece to the teammate whose role fits, review what they hand back, and decide what happens next.

Each round, return:
- new_tasks: work to add to the board. Each has a short key (t1, t2…), a title, an objective (what to produce, which sources or apps to use, the output format), done_when (concrete acceptance criteria), mate_id (a teammate below) and depends_on (keys of earlier new tasks or ids of existing tasks it needs first). Make independent work independent so mates run side by side. Plan the whole job when the board is empty; add tasks later only for gaps. Never repeat work already on the board.
- reviews: for every task in [review], judge the result against its done_when: accept (good enough to build on), revise (say exactly what to change), reassign (a better-suited teammate, with why) or cancel (no longer needed). Failed tasks can be reassigned or cancelled.
- handoff: one or two short lines in your own voice, addressed to teammates by name, saying who does what now (and your verdicts, e.g. "Great research, Nova. Sol, the page is yours."). Empty if nothing changed.
- action: continue while work remains; checkin to ask the user one clear question only for a key decision or information only they have (offer options); finish when every task is done and the goal is met (final_task says how to compile the deliverable).
Leave fields you don't use empty. Mates only see their own task and the results it depends on, so write objectives that stand on their own.

Teammates (id: name — role):
${roster}`;
  const user = `Mission: ${input.mission.goal}\nRound ${input.mission.round}.\n\nBoard:\n${boardForLeader(input.tasks, input.members, notes)}\n\nRecent conversation (the user may have steered the team):\n${recent || "(none)"}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(45_000),
        headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENROUTER_PLANNER_MODEL ?? CHAT_MODEL,
          max_tokens: 2_500,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          response_format: { type: "json_schema", json_schema: { name: "round_decision", strict: true, schema: DECISION_JSON_SCHEMA } },
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = decisionSchema.parse(JSON.parse(body.choices?.[0]?.message?.content ?? "null"));
      return normaliseDecision(raw, { members: input.members, leaderId: leader.id, tasks: input.tasks });
    } catch {
      // One retry; the round then carries on with work already planned instead of bothering the user.
    }
  }
  return null;
}

const DECISION_JSON_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["continue", "checkin", "finish"] },
    handoff: { type: "string" },
    question: { type: "string" },
    final_task: { type: "string" },
    new_tasks: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, title: { type: "string" }, objective: { type: "string" }, done_when: { type: "string" }, mate_id: { type: "string" }, depends_on: { type: "array", items: { type: "string" } } },
        required: ["key", "title", "objective", "done_when", "mate_id", "depends_on"],
        additionalProperties: false,
      },
    },
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: { task_id: { type: "string" }, verdict: { type: "string", enum: ["accept", "revise", "reassign", "cancel"] }, feedback: { type: "string" }, mate_id: { type: "string" } },
        required: ["task_id", "verdict", "feedback", "mate_id"],
        additionalProperties: false,
      },
    },
  },
  required: ["action", "handoff", "question", "final_task", "new_tasks", "reviews"],
  additionalProperties: false,
} as const;

export async function listTasks(missionId: string): Promise<BoardTask[]> {
  return getDb().select().from(missionTasks).where(eq(missionTasks.missionId, missionId)).orderBy(asc(missionTasks.position), asc(missionTasks.createdAt));
}

/** Each task's result is the note saved under its title; these are read whole, never summarised. */
export async function notesByTitle(missionId: string) {
  const rows = await getDb().select({ title: missionNotes.title, content: missionNotes.content }).from(missionNotes).where(eq(missionNotes.missionId, missionId));
  return new Map(rows.map((row) => [row.title.toLowerCase(), row.content]));
}

/** Writes a decision to the board in one batch; new tasks get real ids and their dependencies mapped. */
export async function applyDecision(missionId: string, tasks: BoardTask[], decision: Decision) {
  const ids = new Map(decision.newTasks.map((t) => [t.key, randomUUID()]));
  const start = tasks.reduce((max, t) => Math.max(max, t.position), -1) + 1;
  const now = new Date();
  const writes = [
    ...decision.reviews.map((r) => {
      const task = tasks.find((t) => t.id === r.taskId)!;
      const set =
        r.verdict === "accept" ? { status: "done" as const, finishedAt: now }
        : r.verdict === "cancel" ? { status: "cancelled" as const, finishedAt: now }
        : r.verdict === "revise" ? { status: "queued" as const, feedback: r.feedback, revisions: task.revisions + 1 }
        : { status: "queued" as const, feedback: r.feedback, mateId: r.mateId!, attempts: 0 };
      return getDb().update(missionTasks).set({ ...set, updatedAt: now }).where(and(eq(missionTasks.id, r.taskId), eq(missionTasks.missionId, missionId)));
    }),
    ...(decision.newTasks.length
      ? [getDb().insert(missionTasks).values(decision.newTasks.map((t, i) => ({ id: ids.get(t.key)!, missionId, mateId: t.mateId, title: t.title, objective: t.objective, doneWhen: t.doneWhen, dependsOn: t.dependsOn.map((d) => ids.get(d) ?? d), position: start + i })))]
      : []),
  ];
  if (writes.length) await getDb().batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);
  return listTasks(missionId);
}

export async function setTask(id: string, values: Partial<typeof missionTasks.$inferInsert>) {
  await getDb().update(missionTasks).set({ ...values, updatedAt: new Date() }).where(eq(missionTasks.id, id));
}

/** Tasks left "working" by a round that was stopped or crashed go back in the queue. */
export async function requeueInterrupted(missionId: string) {
  await getDb().update(missionTasks).set({ status: "queued", updatedAt: new Date() }).where(and(eq(missionTasks.missionId, missionId), eq(missionTasks.status, "working")));
}

/** Open tasks whose owner left the group or was deleted, each with the teammate who should take it. */
export function orphanedTasks(tasks: BoardTask[], members: PersonaMate[], leaderId: string) {
  const load = loadOf(tasks);
  const present = new Set(members.map((m) => m.id));
  return tasks
    .filter((t) => (t.status === "queued" || t.status === "review") && (!t.mateId || !present.has(t.mateId)))
    .map((t) => {
      const mateId = ownerFor(undefined, `${t.title} ${t.objective}`, members, leaderId, load);
      load.set(mateId, (load.get(mateId) ?? 0) + 1);
      return { id: t.id, mateId };
    });
}

export async function taskByAgentRun(agentRunId: string) {
  const [task] = await getDb().select().from(missionTasks).where(eq(missionTasks.agentRunId, agentRunId));
  return task ?? null;
}

/** What a mate is told: its task alone, the results it builds on in full, and the leader's notes. */
export function taskBrief(input: { goal: string; task: BoardTask; inputs: { title: string; content: string }[] }) {
  const { goal, task, inputs } = input;
  let budget = 30_000;
  const context = inputs
    .map((i) => {
      const body = i.content.slice(0, Math.max(0, Math.min(12_000, budget)));
      budget -= body.length;
      return body ? `### ${i.title}\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return [
    `Mission: ${goal}`,
    `Your task: ${task.title}`,
    `Objective: ${task.objective}`,
    task.doneWhen ? `Done when: ${task.doneWhen}` : "",
    task.feedback ? `Your lead reviewed your last attempt and asked for these changes:\n${task.feedback}` : "",
    context ? `Results from teammates you build on:\n${context}` : "",
    "Do this task fully yourself, using your tools and apps as needed. Do only this task: teammates handle the rest. Reply with the finished deliverable itself (it's saved to the mission notes as your result), not a description of what you did.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const STATUS_FOR_CARD: Record<TaskStatus, NonNullable<WorkflowCard["handoff"]>["items"][number]["status"]> = {
  queued: "queued",
  working: "working",
  review: "review",
  done: "done",
  failed: "failed",
  waiting: "waiting",
  cancelled: "failed",
};

/** A task's status as the app shows it: a queued task that was sent back reads "changes". */
export const cardStatus = (t: Pick<BoardTask, "status" | "revisions">) => (t.status === "queued" && t.revisions > 0 ? "changes" : STATUS_FOR_CARD[t.status]);

type MateSummary = { id: string; name: string; color: string; shape: string };

/**
 * The pinned board in the app: every live task with its owner, status, current step and timing.
 * Steps come from the round in progress; cancelled tasks are left out.
 */
export function boardView(tasks: (BoardTask & { startedAt: Date | null; finishedAt: Date | null })[], mates: Map<string, MateSummary>, steps: Map<string, string>) {
  return tasks
    .filter((t) => t.status !== "cancelled")
    .map((t) => {
      const mate = t.mateId ? mates.get(t.mateId) : undefined;
      return {
        id: t.id,
        title: t.title,
        status: cardStatus(t),
        mate: mate ? { ...mate, gradient: gradientOf(mate.color) } : null,
        step: t.status === "working" ? steps.get(t.id) ?? null : null,
        startedAt: t.startedAt?.toISOString() ?? null,
        finishedAt: t.finishedAt?.toISOString() ?? null,
        revisions: t.revisions,
      };
    });
}

/** The board as a card: every task with its owner, live status and current step. */
export function boardCard(leader: PersonaMate, members: PersonaMate[], tasks: BoardTask[], round: number, steps: Map<string, string> = new Map()): WorkflowCard {
  const summary = (m: PersonaMate) => ({ id: m.id, name: m.name, color: m.color, shape: m.shape, gradient: gradientOf(m.color) });
  const shown = tasks.filter((t) => t.status !== "cancelled");
  return {
    kind: "handoff",
    phase: shown.some((t) => t.status === "working" || t.status === "queued" || t.status === "review") ? "running" : "done",
    label: `Round ${round}`,
    handoff: {
      round,
      from: summary(leader),
      items: shown.map((t) => ({
        id: t.id,
        mate: summary(members.find((m) => m.id === t.mateId) ?? leader),
        task: t.title,
        status: cardStatus(t),
        ...(steps.get(t.id) ? { step: steps.get(t.id) } : {}),
      })),
    },
  };
}
