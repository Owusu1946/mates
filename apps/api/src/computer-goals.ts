import { tasks } from "@trigger.dev/sdk";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { computerConfigured, dbComputerStore, type ComputerGoal } from "./computers.js";
import { getDb } from "./db/client.js";
import { chatMessages, chats, computerGoals } from "./db/schema.js";
import { pushToUser } from "./delivery.js";
import type { WorkflowCard } from "./integrations.js";
import { assertUsage, userPlan } from "./usage/gate.js";
import { canUseComputer } from "./usage/plans.js";

/**
 * Goals on the mates' computer: "Fill this form", "Find me a flat under GH₵6,000 and save them in a
 * sheet". The chat starts one and moves on; a worker task drives the desktop (./computer-agent.ts)
 * and the card stays live by polling. The outcome lands as a new message, with a notification.
 */

export const ACTIVE_GOAL: ComputerGoal["status"][] = ["queued", "running", "waiting"];
/** A running goal whose row hasn't moved in this long has lost its worker. */
const STALE_RUNNING_MS = 15 * 60_000;
/** A goal waiting on the user gives up after this, so nothing hangs forever. */
export const WAIT_LIMIT_MS = 30 * 60_000;

export const computerUseTool = {
  type: "function" as const,
  function: {
    name: "computer_use",
    description:
      "Do something on the user's own computer (a desktop with Chrome, LibreOffice, files and a terminal), the way a person would: websites that need clicking, signing in, forms, many steps or downloads; making spreadsheets, documents and files. The user watches live and can take over. Use web_read or app tools instead for simple reads and anything a connected app's API does. One clear goal per call, with every detail the mate needs (names, numbers, sites, what done looks like). Returns at once; the result arrives as a new message.",
    parameters: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The goal in one or two sentences, with every detail needed and what counts as done." },
      },
      required: ["goal"],
      additionalProperties: false,
    },
  },
};

export const computerToolArgs = z.object({ goal: z.string().trim().min(3).max(500) });

export function computerCard(goal: ComputerGoal): WorkflowCard {
  const phase: WorkflowCard["phase"] =
    goal.status === "done" ? "done" : goal.status === "failed" || goal.status === "cancelled" ? "error" : goal.status === "waiting" ? "waiting" : "running";
  const label =
    goal.status === "queued" ? "Waiting for the computer"
      : goal.status === "running" ? goal.steps.at(-1)?.label ?? "Starting the computer"
        : goal.status === "waiting" ? goal.waitingFor === "user_control" ? "You have the mouse" : goal.waitingFor === "approval" ? "Needs your OK" : goal.waitingFor === "login" ? "Sign in to continue" : "Has a question"
          : goal.status === "done" ? "Done on the computer"
            : goal.status === "cancelled" ? "Stopped" : "Couldn’t finish on the computer";
  return {
    kind: "computer",
    phase,
    label,
    computer: {
      goalId: goal.id,
      goal: goal.goal,
      status: goal.status,
      ...(goal.waitingFor ? { waitingFor: goal.waitingFor } : {}),
      ...(goal.question ? { question: goal.question } : {}),
      steps: goal.steps.slice(-12),
      ...(goal.summary ? { summary: goal.summary } : {}),
      ...(goal.evidence.length ? { evidence: goal.evidence } : {}),
      ...(goal.error ? { error: goal.error } : {}),
    },
  };
}

/** Starts a goal from the chat. Returns the card, or an error the mate can relay. */
export async function startComputerGoal(userId: string, chatId: string | null, mateId: string | null, raw: unknown) {
  if (!computerConfigured()) return { error: "The computer isn't set up on this server." };
  if (!canUseComputer(await userPlan(userId))) return { error: "The computer comes with Pro and Max.", upgrade: true };
  const { goal } = computerToolArgs.parse(raw);
  await assertUsage(userId, "computer");
  const computer = (await dbComputerStore.byUser(userId)) ?? (await dbComputerStore.create(userId));
  const [row] = await getDb().insert(computerGoals).values({ clerkUserId: userId, computerId: computer.id, chatId, mateId, goal }).returning();
  await tasks.trigger("computer-goal", { goalId: row!.id }, { concurrencyKey: userId, idempotencyKey: `computer_${row!.id}` });
  return { started: true as const, goalId: row!.id, card: computerCard(row!) };
}

export async function ownedGoal(userId: string, id: string) {
  const [row] = await getDb().select().from(computerGoals).where(and(eq(computerGoals.id, id), eq(computerGoals.clerkUserId, userId)));
  return row ?? null;
}

/** Asks the worker to stop; it notices within a few seconds and cleans up. */
export async function cancelComputerGoal(userId: string, id: string) {
  const [row] = await getDb().update(computerGoals).set({ cancelRequested: true, updatedAt: new Date() })
    .where(and(eq(computerGoals.id, id), eq(computerGoals.clerkUserId, userId), inArray(computerGoals.status, ACTIVE_GOAL))).returning();
  return row ?? null;
}

export const replySchema = z.union([
  z.object({ choice: z.enum(["approve", "decline", "continue"]) }),
  z.object({ text: z.string().trim().min(1).max(1000) }),
]);

/** The user's answer to a waiting goal: approve or decline an action, continue after signing in, or a reply. */
export async function replyToGoal(userId: string, id: string, reply: z.infer<typeof replySchema>) {
  const value = "choice" in reply ? reply.choice : reply.text;
  const [row] = await getDb().update(computerGoals).set({ reply: value, status: "running", waitingFor: null, updatedAt: new Date() })
    .where(and(eq(computerGoals.id, id), eq(computerGoals.clerkUserId, userId), eq(computerGoals.status, "waiting"), inArray(computerGoals.waitingFor, ["login", "approval", "question"]))).returning();
  return row ?? null;
}

/** The outcome as a new message in the chat that asked for it, plus a notification. */
export async function announceGoal(id: string) {
  const [goal] = await getDb().select().from(computerGoals).where(eq(computerGoals.id, id));
  if (!goal || goal.status === "cancelled") return;
  const text = goal.status === "done" ? goal.summary ?? "Done." : `I couldn’t finish that on the computer. ${goal.error ?? ""}`.trim();
  if (goal.chatId) {
    const [latest] = await getDb().select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.chatId, goal.chatId)).orderBy(desc(chatMessages.createdAt)).limit(1);
    const messageId = `computer_${goal.id}`;
    await getDb().batch([
      getDb().insert(chatMessages).values({
        chatId: goal.chatId,
        id: messageId,
        parentId: latest?.id ?? null,
        message: {
          id: messageId,
          role: "assistant",
          createdAt: new Date().toISOString(),
          content: [
            { type: "tool-call", toolCallId: `computer_result_${goal.id}`, toolName: "cooper_workflow", args: {}, argsText: "{}", result: computerCard(goal) },
            { type: "text", text },
          ],
          status: { type: "complete", reason: "stop" },
        },
      }).onConflictDoNothing(),
      getDb().update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, goal.chatId)),
    ]);
  }
  await pushToUser(goal.clerkUserId, {
    title: goal.status === "done" ? "Done on your computer" : "Couldn’t finish on your computer",
    body: (goal.status === "done" ? goal.summary : goal.error)?.slice(0, 160) ?? goal.goal.slice(0, 160),
    data: { chatId: goal.chatId ?? undefined, computerGoalId: goal.id, url: "/computer" },
  }).catch(() => undefined);
}

/** Tells the user a goal is waiting on them (a login, an approval, a question). */
export async function notifyWaiting(goal: ComputerGoal) {
  await pushToUser(goal.clerkUserId, {
    title: goal.waitingFor === "approval" ? "Your OK is needed" : goal.waitingFor === "login" ? "Sign in on your computer" : "A quick question",
    body: goal.question?.slice(0, 160) ?? goal.goal.slice(0, 160),
    data: { chatId: goal.chatId ?? undefined, computerGoalId: goal.id, url: "/computer" },
  }).catch(() => undefined);
}

/** Goals the worker lost (crash, deploy, the time limit) are closed honestly. Run by the dispatcher. */
export async function recoverStalledGoals(now = Date.now()) {
  const stalled = await getDb().update(computerGoals)
    .set({ status: "failed", error: "The computer stopped responding. Try again.", waitingFor: null, updatedAt: new Date() })
    .where(and(eq(computerGoals.status, "running"), lt(computerGoals.updatedAt, new Date(now - STALE_RUNNING_MS)))).returning();
  const expired = await getDb().update(computerGoals)
    .set({ status: "failed", error: "Nobody answered in time, so I stopped.", waitingFor: null, updatedAt: new Date() })
    .where(and(eq(computerGoals.status, "waiting"), lt(computerGoals.updatedAt, new Date(now - WAIT_LIMIT_MS - 5 * 60_000)))).returning();
  for (const goal of [...stalled, ...expired]) await announceGoal(goal.id).catch(() => undefined);
  return stalled.length + expired.length;
}
