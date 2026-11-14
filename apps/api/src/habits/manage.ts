import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { activityEvents, habitNudges, habits, interests, meetingPreps, profiles } from "../db/schema.js";
import { mateChatId } from "../mates.js";
import { nextDue, whenText } from "./miner.js";
import { AUTOMATE_AFTER, habitMates } from "./nudges.js";
import { startObserving, stopObserving } from "./observers.js";
import { PREP_PLANS } from "./prep.js";
import { habitsEnabled, learningFor } from "./shared.js";

/** "What I've noticed": the habits, topics and switches the user sees and controls. */

type HabitRow = typeof habits.$inferSelect;

export function habitView(habit: HabitRow, mate: { id: string; name: string; color: string } | undefined) {
  return {
    id: habit.id,
    version: habit.version,
    title: habit.title,
    description: habit.description,
    when: whenText(habit.trigger),
    trigger: habit.trigger,
    evidence: habit.evidence,
    confidence: habit.confidence,
    status: habit.status,
    automatic: habit.automatic,
    canAutomate: !habit.automatic && habit.accepted >= AUTOMATE_AFTER - 1,
    accepted: habit.accepted,
    nextDueAt: habit.nextDueAt?.toISOString() ?? null,
    mate: mate ? { id: mate.id, name: mate.name, color: mate.color, chatId: mateChatId(mate.id) } : null,
  };
}
export type HabitView = ReturnType<typeof habitView>;

export async function listHabits(userId: string) {
  const [rows, topics, mates, learning, [profile]] = await Promise.all([
    getDb().select().from(habits).where(and(eq(habits.clerkUserId, userId), sql`${habits.status} <> 'dismissed'`)).orderBy(desc(habits.confidence)).limit(100),
    getDb().select({ topic: interests.topic, weight: interests.weight, lastSeenAt: interests.lastSeenAt }).from(interests).where(and(eq(interests.clerkUserId, userId), gte(interests.weight, 0))).orderBy(desc(interests.weight)).limit(30),
    habitMates(userId),
    learningFor(userId),
    getDb().select({ memoryEnabled: profiles.memoryEnabled, habitLearning: profiles.habitLearning, learnFromApps: profiles.learnFromApps, meetingPrep: profiles.meetingPrep, observerTriggers: profiles.observerTriggers }).from(profiles).where(eq(profiles.clerkUserId, userId)),
  ]);
  return {
    available: habitsEnabled(),
    habits: rows.map((h) => habitView(h, mates.find((m) => m.id === h.mateId))),
    topics: topics.map((t) => ({ topic: t.topic, lastSeenAt: t.lastSeenAt.toISOString() })),
    settings: {
      memoryEnabled: profile?.memoryEnabled ?? true,
      habitLearning: profile?.habitLearning ?? true,
      learnFromApps: profile?.learnFromApps ?? false,
      meetingPrep: profile?.meetingPrep ?? true,
      observing: (profile?.observerTriggers ?? []).map((o) => o.toolkit),
      // Learning from apps and meeting prep come with Plus.
      plusFeatures: PREP_PLANS.includes(learning.plan),
    },
  };
}

export const habitChangeSchema = z.object({
  action: z.enum(["confirm", "pause", "resume", "retime"]),
  version: z.number().int().positive(),
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
});

/** Confirm, pause, resume or move a habit's time; versioned so two screens can't fight. */
export async function changeHabit(userId: string, id: string, change: z.infer<typeof habitChangeSchema>) {
  const [habit] = await getDb().select().from(habits).where(and(eq(habits.id, id), eq(habits.clerkUserId, userId)));
  if (!habit || habit.version !== change.version || habit.status === "dismissed") return null;
  let trigger = habit.trigger;
  if (change.action === "retime") {
    if (trigger.type !== "time" || change.hour === undefined) return null;
    trigger = { ...trigger, hour: change.hour, minute: change.minute ?? 0 };
  }
  const status = change.action === "pause" ? "paused" : change.action === "resume" ? (habit.accepted ? "confirmed" : "candidate") : change.action === "confirm" ? "confirmed" : habit.status;
  const [updated] = await getDb()
    .update(habits)
    .set({ status, trigger, nextDueAt: status === "paused" || habit.automatic ? null : nextDue(trigger), version: habit.version + 1, updatedAt: new Date() })
    .where(and(eq(habits.id, id), eq(habits.version, change.version)))
    .returning();
  if (!updated) return null;
  return habitView(updated, (await habitMates(userId)).find((m) => m.id === updated.mateId));
}

/**
 * Removing a habit: it's kept as dismissed, so the miner doesn't find it again tomorrow. Routines
 * it became stay; they're managed on the Routines screen.
 */
export async function removeHabit(userId: string, id: string) {
  const result = await getDb().update(habits).set({ status: "dismissed", nextDueAt: null, updatedAt: new Date() }).where(and(eq(habits.id, id), eq(habits.clerkUserId, userId))).returning({ id: habits.id });
  return result.length > 0;
}

/** A topic the user doesn't want followed: kept at -1 so it isn't learned again. */
export async function removeTopic(userId: string, topic: string) {
  await getDb().update(interests).set({ weight: -1 }).where(and(eq(interests.clerkUserId, userId), eq(interests.topic, topic.toLowerCase())));
}

export const habitSettingsSchema = z.object({
  habitLearning: z.boolean().optional(),
  learnFromApps: z.boolean().optional(),
  meetingPrep: z.boolean().optional(),
});

export class HabitSettingsError extends Error {}

/** The switches. Turning learning off clears what was learned; turning app learning on creates the observers. */
export async function saveHabitSettings(userId: string, input: z.infer<typeof habitSettingsSchema>) {
  const learning = await learningFor(userId);
  const plus = PREP_PLANS.includes(learning.plan);
  if ((input.learnFromApps || input.meetingPrep) && !plus) throw new HabitSettingsError("PLAN");
  await getDb().update(profiles).set(input).where(eq(profiles.clerkUserId, userId));
  if (input.habitLearning === false) await clearHabits(userId, { keepSettings: true });
  if (input.learnFromApps === true) await startObserving(userId);
  if (input.learnFromApps === false || input.habitLearning === false) await stopObserving(userId);
  if (input.meetingPrep === false) await getDb().delete(meetingPreps).where(and(eq(meetingPreps.clerkUserId, userId), eq(meetingPreps.status, "scheduled")));
  return listHabits(userId);
}

/** "Clear everything": habits, topics, nudges, the activity log and upcoming preps, at once. */
export async function clearHabits(userId: string, { keepSettings = false } = {}) {
  await getDb().batch([
    getDb().delete(habitNudges).where(eq(habitNudges.clerkUserId, userId)),
    getDb().delete(habits).where(eq(habits.clerkUserId, userId)),
    getDb().delete(interests).where(eq(interests.clerkUserId, userId)),
    getDb().delete(activityEvents).where(eq(activityEvents.clerkUserId, userId)),
    getDb().delete(meetingPreps).where(eq(meetingPreps.clerkUserId, userId)),
  ]);
  if (!keepSettings) await stopObserving(userId);
}
