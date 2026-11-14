import { desc, eq } from "drizzle-orm";
import { DateTime, IANAZone } from "luxon";
import { getDb } from "../db/client.js";
import { deviceTokens, profiles } from "../db/schema.js";
import { CHAT_MODEL } from "../models.js";
import { meterOpenRouter, type MeterContext, type OpenRouterUsage } from "../usage/openrouter.js";
import { resolvePlan } from "../usage/plans.js";

export const habitsEnabled = () => process.env.HABITS_ENABLED === "true";

/** The user's timezone: their phone's, else what their last request said, else Accra (the app's fallback). */
export async function userTimezone(userId: string, hint?: string | null) {
  if (hint && IANAZone.isValidZone(hint)) return hint;
  const [device] = await getDb().select({ timezone: deviceTokens.timezone }).from(deviceTokens).where(eq(deviceTokens.clerkUserId, userId)).orderBy(desc(deviceTokens.updatedAt)).limit(1);
  return device?.timezone && IANAZone.isValidZone(device.timezone) ? device.timezone : "Africa/Accra";
}

/** Local weekday (1 = Monday), hour and minute of a moment, in a timezone. */
export function localParts(at: Date, timezone: string) {
  const local = DateTime.fromJSDate(at).setZone(timezone);
  return { localDow: local.weekday, localHour: local.hour, localMinute: local.minute };
}

/** Whether habit learning is on for this user: their own switch, under memory's main switch. */
export async function learningFor(userId: string) {
  const [profile] = await getDb()
    .select({ memoryEnabled: profiles.memoryEnabled, habitLearning: profiles.habitLearning, learnFromApps: profiles.learnFromApps, meetingPrep: profiles.meetingPrep, plan: profiles.plan })
    .from(profiles)
    .where(eq(profiles.clerkUserId, userId));
  const memory = profile?.memoryEnabled ?? true;
  return {
    habits: habitsEnabled() && memory && (profile?.habitLearning ?? true),
    apps: habitsEnabled() && memory && (profile?.learnFromApps ?? false),
    prep: habitsEnabled() && (profile?.meetingPrep ?? true),
    plan: resolvePlan(profile?.plan),
  };
}

type Message = { role: "system" | "user"; content: string };

/** One small structured call on the fast model, metered to the person it was for. */
export async function structured<T>(name: string, schema: object, messages: Message[], meter: MeterContext, maxTokens = 600): Promise<T> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: CHAT_MODEL, max_tokens: maxTokens, reasoning: { effort: "low" }, usage: { include: true }, messages, response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } }),
  });
  const body = (await response.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; usage?: OpenRouterUsage };
  void meterOpenRouter(meter, CHAT_MODEL, body.usage);
  if (!response.ok) throw new Error(`habits model ${response.status}`);
  return JSON.parse(body.choices?.[0]?.message?.content ?? "null") as T;
}

/** Categories never turned into habits or topics, whatever the data shows. */
export const SENSITIVE = "health or medical, religion, sexuality, politics, detailed money or debt, legal trouble, or other people's private matters";
