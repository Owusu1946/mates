import { DateTime, IANAZone } from "luxon";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { deviceTokens, morningBriefs, morningBriefSettings } from "./db/schema.js";
import { nextOccurrence } from "./scheduling.js";

export const briefSections = ["calendar", "email", "weather", "power", "rides", "bills", "tasks", "deferred"] as const;
export type BriefSection = (typeof briefSections)[number];
export const briefSettingsInput = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().refine((value) => IANAZone.isValidZone(value), "Choose a valid timezone"),
  weekends: z.enum(["full", "light", "off"]),
  sections: z.array(z.enum(briefSections)).min(1).max(briefSections.length).refine((items) => new Set(items).size === items.length, "Choose each section once"),
}).strict();
export type BriefSettingsInput = z.infer<typeof briefSettingsInput>;

const defaultSections: BriefSection[] = ["calendar", "email", "tasks"];

/** A brief is due at the person's wall-clock time; off weekends skip to Monday. */
export function nextBriefAt(settings: BriefSettingsInput, after = new Date()): Date | null {
  if (!settings.enabled) return null;
  let cursor = after;
  for (let attempt = 0; attempt < 8; attempt++) {
    const next = nextOccurrence({ title: "Morning brief", prompt: "Morning brief", frequency: "daily", timezone: settings.timezone, time: settings.time, weekday: null, onceAt: null }, cursor);
    if (!next) return null;
    const weekday = DateTime.fromJSDate(next, { zone: settings.timezone }).weekday;
    if (settings.weekends !== "off" || weekday <= 5) return next;
    cursor = next;
  }
  throw new Error("Could not find the next brief time");
}

export async function getBriefSettings(userId: string) {
  const [saved] = await getDb().select().from(morningBriefSettings).where(eq(morningBriefSettings.clerkUserId, userId)).limit(1);
  if (saved) return { enabled: saved.enabled, time: saved.time, timezone: saved.timezone, weekends: saved.weekends, sections: saved.sections, mutedSections: saved.mutedSections, nextRunAt: saved.nextRunAt };
  const [device] = await getDb().select({ timezone: deviceTokens.timezone }).from(deviceTokens).where(eq(deviceTokens.clerkUserId, userId)).orderBy(desc(deviceTokens.updatedAt)).limit(1);
  return { enabled: false, time: "07:00", timezone: device?.timezone ?? "Africa/Accra", weekends: "light" as const, sections: defaultSections, mutedSections: [] as BriefSection[], nextRunAt: null };
}

export async function putBriefSettings(userId: string, input: BriefSettingsInput) {
  const nextRunAt = nextBriefAt(input);
  const [saved] = await getDb().insert(morningBriefSettings).values({ clerkUserId: userId, ...input, nextRunAt }).onConflictDoUpdate({
    target: morningBriefSettings.clerkUserId,
    set: { ...input, nextRunAt, updatedAt: new Date() },
  }).returning();
  return { enabled: saved!.enabled, time: saved!.time, timezone: saved!.timezone, weekends: saved!.weekends, sections: saved!.sections, mutedSections: saved!.mutedSections, nextRunAt: saved!.nextRunAt };
}

/** Viewing is recorded once, including if the chat is reopened or loaded from a push twice. */
export async function viewMorningBrief(userId: string, id: string) {
  const [viewed] = await getDb().update(morningBriefs).set({ viewedAt: sql`coalesce(${morningBriefs.viewedAt}, now())` })
    .where(and(eq(morningBriefs.id, id), eq(morningBriefs.clerkUserId, userId), eq(morningBriefs.status, "posted")))
    .returning({ id: morningBriefs.id });
  return !!viewed;
}

/** A line can only mute its own section in one of this user's saved briefs. */
export async function markBriefLineNotUseful(userId: string, id: string, lineId: string) {
  const [brief] = await getDb().select({ lines: morningBriefs.lines }).from(morningBriefs)
    .where(and(eq(morningBriefs.id, id), eq(morningBriefs.clerkUserId, userId), eq(morningBriefs.status, "posted"))).limit(1);
  const section = brief?.lines?.find((line) => line.id === lineId)?.section;
  if (!section) return false;
  const [saved] = await getDb().update(morningBriefSettings).set({
    mutedSections: sql`case when ${morningBriefSettings.mutedSections} ? ${section} then ${morningBriefSettings.mutedSections} else ${morningBriefSettings.mutedSections} || ${JSON.stringify([section])}::jsonb end`,
    updatedAt: new Date(),
  }).where(eq(morningBriefSettings.clerkUserId, userId)).returning({ clerkUserId: morningBriefSettings.clerkUserId });
  return !!saved;
}

/** Restoring one section leaves feedback for every other section intact. */
export async function restoreBriefSection(userId: string, section: BriefSection) {
  const [saved] = await getDb().update(morningBriefSettings).set({
    mutedSections: sql`${morningBriefSettings.mutedSections} - ${section}`,
    updatedAt: new Date(),
  }).where(eq(morningBriefSettings.clerkUserId, userId)).returning({ clerkUserId: morningBriefSettings.clerkUserId });
  return !!saved;
}
