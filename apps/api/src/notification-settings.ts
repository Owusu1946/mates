import { DateTime, IANAZone } from "luxon";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { chats, deviceTokens, mateNotificationSettings, mates } from "./db/schema.js";
import { MateError } from "./mates.js";

export const mateNotificationModes = ["normal", "urgent_only", "off"] as const;
export type MateNotificationMode = (typeof mateNotificationModes)[number];

const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time, such as 22:00");

export const mateNotificationSettingsInput = z.object({
  mode: z.enum(mateNotificationModes),
  quietStart: localTime,
  quietEnd: localTime,
}).strict();
export type MateNotificationSettingsInput = z.infer<typeof mateNotificationSettingsInput>;

export const DEFAULT_MATE_NOTIFICATION_SETTINGS: MateNotificationSettingsInput = {
  mode: "normal",
  quietStart: "22:00",
  quietEnd: "07:00",
};

export const MATE_DAILY_UNPROMPTED_LIMIT = 1;
export const USER_DAILY_UNPROMPTED_LIMIT = 3;

export type ProactivePushDecision = "send" | "disabled" | "urgent_only" | "mate_daily_limit" | "user_daily_limit";

/** Applies the opt-out and daily budgets. Urgent pushes bypass both budgets, but not mode=off. */
export function proactivePushDecision(input: {
  mode: MateNotificationMode;
  urgent: boolean;
  mateSentToday: number;
  userSentToday: number;
}): ProactivePushDecision {
  if (input.mode === "off") return "disabled";
  if (input.urgent) return "send";
  if (input.mode === "urgent_only") return "urgent_only";
  if (input.userSentToday >= USER_DAILY_UNPROMPTED_LIMIT) return "user_daily_limit";
  if (input.mateSentToday >= MATE_DAILY_UNPROMPTED_LIMIT) return "mate_daily_limit";
  return "send";
}

/** Quiet intervals are local wall-clock times; equal endpoints mean quiet hours are disabled. */
export function isWithinQuietHours(input: {
  now: Date;
  timezone: string;
  quietStart: string;
  quietEnd: string;
}): boolean {
  if (!IANAZone.isValidZone(input.timezone)) return false;
  if (!localTime.safeParse(input.quietStart).success || !localTime.safeParse(input.quietEnd).success) return false;
  if (input.quietStart === input.quietEnd) return false;

  const local = DateTime.fromJSDate(input.now).setZone(input.timezone);
  if (!local.isValid) return false;
  const minute = local.hour * 60 + local.minute;
  const start = timeToMinutes(input.quietStart);
  const end = timeToMinutes(input.quietEnd);
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** The first end of this quiet interval after `now`, honoring timezone transitions. */
export function nextQuietHoursEnd(now: Date, timezone: string, quietEnd: string): Date | null {
  if (!IANAZone.isValidZone(timezone) || !localTime.safeParse(quietEnd).success) return null;
  const local = DateTime.fromJSDate(now).setZone(timezone);
  const [hour, minute] = quietEnd.split(":").map(Number);
  let end = local.set({ hour, minute, second: 0, millisecond: 0 });
  if (end <= local) end = end.plus({ days: 1 });
  return end.toJSDate();
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
}

async function timezoneForUser(userId: string) {
  const [device] = await getDb()
    .select({ timezone: deviceTokens.timezone })
    .from(deviceTokens)
    .where(eq(deviceTokens.clerkUserId, userId))
    .orderBy(desc(deviceTokens.updatedAt))
    .limit(1);
  return device?.timezone && IANAZone.isValidZone(device.timezone) ? device.timezone : "Africa/Accra";
}

async function assertOwnedMate(userId: string, mateId: string) {
  const [mate] = await getDb()
    .select({ id: mates.id })
    .from(mates)
    .where(and(eq(mates.id, mateId), eq(mates.clerkUserId, userId)))
    .limit(1);
  if (!mate) throw new MateError("NOT_FOUND");
}

/** Resolve the sender mate from its chat; routine and group chats may use the leader mate column. */
export async function resolveMateIdForChat(userId: string, chatId: string | null | undefined) {
  if (chatId) {
    const [chat] = await getDb()
      .select({ mateId: chats.mateId, leaderMateId: chats.leaderMateId })
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.clerkUserId, userId)))
      .limit(1);
    const candidate = chat?.mateId ?? chat?.leaderMateId;
    if (candidate) {
      const [owned] = await getDb()
        .select({ id: mates.id })
        .from(mates)
        .where(and(eq(mates.id, candidate), eq(mates.clerkUserId, userId)))
        .limit(1);
      if (owned) return owned.id;
    }
  }
  const [lead] = await getDb()
    .select({ id: mates.id })
    .from(mates)
    .where(and(eq(mates.clerkUserId, userId), eq(mates.isDefault, true)))
    .limit(1);
  return lead?.id ?? null;
}

/** Settings are lazily persisted; a new mate receives defaults without a migration backfill. */
export async function getMateNotificationSettings(userId: string, mateId: string) {
  await assertOwnedMate(userId, mateId);
  const [saved] = await getDb()
    .select()
    .from(mateNotificationSettings)
    .where(and(eq(mateNotificationSettings.clerkUserId, userId), eq(mateNotificationSettings.mateId, mateId)))
    .limit(1);
  return {
    mateId,
    ...DEFAULT_MATE_NOTIFICATION_SETTINGS,
    ...(saved ? {
      mode: saved.mode,
      quietStart: saved.quietStart,
      quietEnd: saved.quietEnd,
    } : {}),
    timezone: await timezoneForUser(userId),
  };
}

export async function putMateNotificationSettings(userId: string, mateId: string, input: MateNotificationSettingsInput) {
  await assertOwnedMate(userId, mateId);
  const [saved] = await getDb()
    .insert(mateNotificationSettings)
    .values({ clerkUserId: userId, mateId, ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [mateNotificationSettings.clerkUserId, mateNotificationSettings.mateId],
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  return {
    mateId,
    mode: saved!.mode,
    quietStart: saved!.quietStart,
    quietEnd: saved!.quietEnd,
    timezone: await timezoneForUser(userId),
  };
}
