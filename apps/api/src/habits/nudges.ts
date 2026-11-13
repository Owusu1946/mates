import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { getDb } from "../db/client.js";
import { chatMessages, chats, delegations, deviceTokens, habitNudges, habits, mates, type ActivityKind, type NudgeOutcome } from "../db/schema.js";
import { pushToUser } from "../delivery.js";
import { submitRun } from "../durable-runs.js";
import type { WorkflowCard } from "../integrations.js";
import { mateChatId } from "../mates.js";
import { routineChat, scheduleRoutine } from "../scheduling.js";
import { recordActivity, doneToday } from "./activity.js";
import { nextDue, whenText } from "./miner.js";
import { learningFor } from "./shared.js";

/**
 * Nudges: a mate offering, in its own chat, to handle something the user usually does around now
 * (or straight after a meeting or app event). A nudge is a message and a push, with no run and no
 * model cost; only "Handle it" starts work, in that chat, under the user's usual approval rules.
 */

type HabitRow = typeof habits.$inferSelect;

export const MAX_NUDGES_PER_DAY = 2;
/** Offered from this many "Handle it"s on. */
export const AUTOMATE_AFTER = 3;
/** A candidate is offered on its own once it's this sure; confirmed ones always are. */
const OFFER_CONFIDENCE = 0.8;

const offerable = (habit: Pick<HabitRow, "status" | "confidence" | "automatic">) =>
  !habit.automatic && (habit.status === "confirmed" || (habit.status === "candidate" && habit.confidence >= OFFER_CONFIDENCE));

/** Whether the user's most recent phone is in its quiet hours now. */
export async function inQuietHours(userId: string, now = new Date()) {
  const [device] = await getDb().select().from(deviceTokens).where(and(eq(deviceTokens.clerkUserId, userId), eq(deviceTokens.enabled, true))).orderBy(desc(deviceTokens.updatedAt)).limit(1);
  if (!device || device.quietStart === device.quietEnd) return false;
  const hour = DateTime.fromJSDate(now).setZone(device.timezone).hour;
  return device.quietStart < device.quietEnd ? hour >= device.quietStart && hour < device.quietEnd : hour >= device.quietStart || hour < device.quietEnd;
}

async function nudgesToday(userId: string, timezone: string, now: Date) {
  const start = DateTime.fromJSDate(now).setZone(timezone).startOf("day").toJSDate();
  const [row] = await getDb().select({ count: sql<number>`count(*)::int` }).from(habitNudges).where(and(eq(habitNudges.clerkUserId, userId), gte(habitNudges.sentAt, start)));
  return row?.count ?? 0;
}

async function chatBusy(chatId: string) {
  const [run] = await getDb().select({ id: delegations.id }).from(delegations).where(and(eq(delegations.chatId, chatId), inArray(delegations.status, ["queued", "running"]))).limit(1);
  return !!run;
}

export function nudgeCard(habit: Pick<HabitRow, "id" | "title" | "trigger" | "accepted" | "automatic">, nudgeId: string, outcome: NudgeOutcome | null = null): WorkflowCard {
  return {
    kind: "nudge",
    phase: "done",
    label: habit.title,
    nudge: { habitId: habit.id, nudgeId, title: habit.title, when: whenText(habit.trigger), outcome, canAutomate: !habit.automatic && habit.accepted >= AUTOMATE_AFTER - 1 },
  };
}

export type NudgeSkip = "learning_off" | "done_today" | "quiet" | "daily_limit" | "busy";

/**
 * Posts the offer in the mate's chat and pushes it. Checks, in order: learning is on, it wasn't
 * already done today, the phone isn't in quiet hours, today's limit isn't reached, the chat is free.
 */
export async function sendNudge(habit: HabitRow, now = new Date()): Promise<{ sent: true; chatId: string; nudgeId: string } | { sent: false; reason: NudgeSkip }> {
  const learning = await learningFor(habit.clerkUserId);
  if (!learning.habits) return { sent: false, reason: "learning_off" };
  const timezone = habit.trigger.type === "time" ? habit.trigger.tz : "Africa/Accra";
  if (habit.trigger.type === "time" && (await doneToday(habit.clerkUserId, habit.taskKey, timezone, now))) return { sent: false, reason: "done_today" };
  if (await inQuietHours(habit.clerkUserId, now)) return { sent: false, reason: "quiet" };
  if ((await nudgesToday(habit.clerkUserId, timezone, now)) >= MAX_NUDGES_PER_DAY) return { sent: false, reason: "daily_limit" };
  const chatId = await routineChat(habit.clerkUserId, habit.mateId ? mateChatId(habit.mateId) : null);
  if (await chatBusy(chatId)) return { sent: false, reason: "busy" };

  const nudgeId = randomUUID();
  const messageId = `nudge_${nudgeId}`;
  const message = {
    id: messageId,
    role: "assistant",
    createdAt: now.toISOString(),
    content: [
      { type: "text", text: habit.line },
      { type: "tool-call", toolCallId: messageId, toolName: "cooper_workflow", args: {}, argsText: "{}", result: nudgeCard(habit, nudgeId) },
    ],
    status: { type: "complete", reason: "stop" },
    metadata: { custom: { nudge: { habitId: habit.id, nudgeId } } },
  };
  const [head] = await getDb().select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.chatId, chatId)).orderBy(desc(chatMessages.createdAt)).limit(1);
  await getDb().batch([
    getDb().insert(chatMessages).values({ chatId, id: messageId, parentId: head?.id ?? null, message }),
    getDb().insert(habitNudges).values({ id: nudgeId, habitId: habit.id, clerkUserId: habit.clerkUserId, chatId, messageId, sentAt: now }),
    getDb().update(habits).set({ lastNudgedAt: now }).where(eq(habits.id, habit.id)),
    getDb().update(chats).set({ updatedAt: now }).where(eq(chats.id, chatId)),
  ]);
  const [chat] = await getDb().select({ title: chats.title }).from(chats).where(eq(chats.id, chatId));
  await pushToUser(habit.clerkUserId, { title: chat?.title ?? "Mates", body: habit.line.slice(0, 180), data: { chatId, chatKind: "mate" } }).catch(() => false);
  return { sent: true, chatId, nudgeId };
}

/**
 * The dispatcher's share (every minute): claims time habits coming due in the next 5 minutes,
 * moving each on to its next occurrence first so it's offered once, then offers it. A habit
 * whose time passed more than an hour ago (the worker was down) just moves on.
 */
export async function dispatchNudges(now = new Date()) {
  const due = await getDb()
    .select()
    .from(habits)
    .where(and(inArray(habits.status, ["candidate", "confirmed"]), eq(habits.automatic, false), sql`${habits.trigger}->>'type' = 'time'`, sql`${habits.nextDueAt} <= ${new Date(now.getTime() + 5 * 60_000)}`))
    .limit(50);
  for (const habit of due) {
    const next = nextDue(habit.trigger, new Date(Math.max(now.getTime(), habit.nextDueAt!.getTime()) + 10 * 60_000));
    const [claimed] = await getDb()
      .update(habits)
      .set({ nextDueAt: next })
      .where(and(eq(habits.id, habit.id), eq(habits.nextDueAt, habit.nextDueAt!)))
      .returning();
    if (!claimed || !offerable(habit) || now.getTime() - habit.nextDueAt!.getTime() > 60 * 60_000) continue;
    await sendNudge(habit, now).catch((error) => console.warn("nudge_failed", { id: habit.id, message: error instanceof Error ? error.message : String(error) }));
  }
}

/**
 * Something happened (a meeting ended, an app event came in): offers any follow-up habit for it
 * straight away, or does it when the user made it automatic.
 */
export async function onActivityEvent(userId: string, kind: ActivityKind, slug: string | null, ref: string) {
  const learning = await learningFor(userId).catch(() => null);
  if (!learning?.habits) return;
  const followUps = await getDb()
    .select()
    .from(habits)
    .where(and(eq(habits.clerkUserId, userId), inArray(habits.status, ["candidate", "confirmed"]), sql`${habits.trigger}->>'type' = 'after_event'`, sql`${habits.trigger}->>'kind' = ${kind}`));
  for (const habit of followUps) {
    if (habit.trigger.type !== "after_event" || (habit.trigger.match && habit.trigger.match !== slug)) continue;
    if (habit.automatic) await handleHabit(habit, `${habit.id}_${ref}`.slice(0, 120)).catch(() => console.warn("habit_auto_failed", { id: habit.id }));
    else if (offerable(habit)) await sendNudge(habit).catch(() => console.warn("nudge_failed", { id: habit.id }));
  }
}

/** Starts the habit's task in its mate's chat, as a run of its own ("habit_" key, metered as habit). */
async function handleHabit(habit: HabitRow, key: string) {
  const chatId = await routineChat(habit.clerkUserId, habit.mateId ? mateChatId(habit.mateId) : null);
  const prompt = `${habit.actionPrompt}\n\n(${habit.automatic ? "This runs automatically: the user asked you to do it each time without asking." : "The user tapped \"Handle it\" on your offer."} Do it now. Follow their usual approval rules for anything sent or changed as them.)`;
  const parentId = `user_habit_${key}`;
  const [head] = await getDb().select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.chatId, chatId)).orderBy(desc(chatMessages.createdAt)).limit(1);
  await getDb()
    .insert(chatMessages)
    .values({ chatId, id: parentId, parentId: head?.id ?? null, message: { id: parentId, role: "user", createdAt: new Date().toISOString(), content: [{ type: "text", text: prompt }], metadata: { custom: { habit: { id: habit.id, title: habit.title } } } } })
    .onConflictDoNothing();
  const run = await submitRun(habit.clerkUserId, { chatId, parentId, assistantMessageId: `assistant_habit_${key}`, requestKey: `habit_${key}`, messages: [{ role: "user", content: prompt }] });
  // Counts as done today, so it isn't offered again.
  await recordActivity([{ userId: habit.clerkUserId, kind: "ask", taskKey: habit.taskKey, label: habit.title, chatId, mateId: habit.mateId, ref: run.id }]);
  return { runId: run.id, chatId };
}

/** Rewrites the nudge's card in its chat so it shows what was chosen. */
async function settleCard(nudge: typeof habitNudges.$inferSelect, habit: HabitRow, outcome: NudgeOutcome) {
  const [row] = await getDb().select().from(chatMessages).where(and(eq(chatMessages.chatId, nudge.chatId), eq(chatMessages.id, nudge.messageId)));
  if (!row || !Array.isArray(row.message.content)) return;
  const content = (row.message.content as Record<string, unknown>[]).map((part) => (part.type === "tool-call" ? { ...part, result: nudgeCard(habit, nudge.id, outcome) } : part));
  await getDb().update(chatMessages).set({ message: { ...row.message, content } }).where(and(eq(chatMessages.chatId, nudge.chatId), eq(chatMessages.id, nudge.messageId)));
}

export type NudgeAction = "handle" | "skip" | "stop" | "automate";

export class HabitError extends Error {}

/**
 * The buttons on a nudge. Handle runs the task and confirms the habit; skip counts against it;
 * stop dismisses it for good; automate does it without asking from now on.
 */
export async function nudgeAction(userId: string, nudgeId: string, action: NudgeAction) {
  const [nudge] = await getDb().select().from(habitNudges).where(and(eq(habitNudges.id, nudgeId), eq(habitNudges.clerkUserId, userId)));
  if (!nudge) throw new HabitError("NOT_FOUND");
  const [habit] = await getDb().select().from(habits).where(eq(habits.id, nudge.habitId));
  if (!habit) throw new HabitError("NOT_FOUND");
  // One answer per nudge, except making it automatic after handling it.
  if (nudge.outcome && !(nudge.outcome === "handled" && action === "automate")) throw new HabitError("ALREADY_ANSWERED");

  let result: { runId?: string; chatId?: string; routineIds?: string[] } = {};
  let updated: HabitRow = habit;
  if (action === "handle") {
    result = await handleHabit(habit, nudge.id);
    [updated] = await getDb().update(habits).set({ status: "confirmed", accepted: sql`${habits.accepted} + 1`, skipped: 0, version: sql`${habits.version} + 1`, updatedAt: new Date() }).where(eq(habits.id, habit.id)).returning() as [HabitRow];
  } else if (action === "skip") {
    [updated] = await getDb().update(habits).set({ skipped: sql`${habits.skipped} + 1`, updatedAt: new Date() }).where(eq(habits.id, habit.id)).returning() as [HabitRow];
  } else if (action === "stop") {
    [updated] = await getDb().update(habits).set({ status: "dismissed", nextDueAt: null, version: sql`${habits.version} + 1`, updatedAt: new Date() }).where(eq(habits.id, habit.id)).returning() as [HabitRow];
  } else {
    if (habit.accepted < AUTOMATE_AFTER - 1 && nudge.outcome !== "handled") throw new HabitError("NOT_YET");
    result = await automateHabit(habit, nudge.chatId);
    [updated] = (await getDb().select().from(habits).where(eq(habits.id, habit.id))) as [HabitRow];
  }
  const outcome: NudgeOutcome = action === "handle" ? "handled" : action === "skip" ? "skipped" : action === "stop" ? "stopped" : "automated";
  await getDb().update(habitNudges).set({ outcome }).where(eq(habitNudges.id, nudge.id));
  await settleCard(nudge, updated, outcome);
  return { outcome, ...result };
}

/**
 * Makes a habit automatic. A time habit becomes routines (one per weekday, or one daily routine
 * when it's every day) in its mate's chat; a follow-up is then done straight after its event.
 */
export async function automateHabit(habit: HabitRow, chatId?: string) {
  const routineIds: string[] = [];
  if (habit.trigger.type === "time") {
    const trigger = habit.trigger;
    const time = `${String(trigger.hour).padStart(2, "0")}:${String(trigger.minute).padStart(2, "0")}`;
    const chat = chatId ?? (await routineChat(habit.clerkUserId, habit.mateId ? mateChatId(habit.mateId) : null));
    const spec = { title: habit.title, prompt: habit.actionPrompt, timezone: trigger.tz, time, onceAt: null };
    if (trigger.dows.length === 7) routineIds.push((await scheduleRoutine(habit.clerkUserId, { ...spec, frequency: "daily", weekday: null }, chat, habit.description)).id);
    else for (const weekday of trigger.dows) routineIds.push((await scheduleRoutine(habit.clerkUserId, { ...spec, frequency: "weekly", weekday }, chat, habit.description)).id);
  }
  await getDb()
    .update(habits)
    .set({ status: "confirmed", automatic: true, routineId: routineIds[0] ?? null, nextDueAt: null, version: sql`${habits.version} + 1`, updatedAt: new Date() })
    .where(eq(habits.id, habit.id));
  return { routineIds };
}

/** The mate a habit belongs to, for the "What I've noticed" list. */
export async function habitMates(userId: string) {
  return getDb().select({ id: mates.id, name: mates.name, color: mates.color }).from(mates).where(eq(mates.clerkUserId, userId));
}
