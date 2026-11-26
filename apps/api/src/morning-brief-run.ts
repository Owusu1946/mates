import { tasks } from "@trigger.dev/sdk";
import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { getDb } from "./db/client.js";
import { chatMessages, chats, morningBriefs, morningBriefSettings, proactiveNotifications } from "./db/schema.js";
import { pushProactiveToUser } from "./delivery.js";
import { ensureDefaultMate, mateChatId } from "./mates.js";
import { nextBriefAt, type BriefSettingsInput } from "./morning-brief.js";
import { collectBriefCandidates, composeBriefLines, type BriefLine } from "./morning-brief-sources.js";
import type { morningBriefJob } from "./trigger/agent.js";

const FRESH_MS = 90 * 60_000;
const PUSH_WINDOW_MS = 2 * 60 * 60_000;

/** A local-day key is stable across dispatcher restarts and timezone changes later in the day. */
export function briefLocalDay(at: Date, timezone: string) {
  return DateTime.fromJSDate(at).setZone(timezone).toISODate()!;
}

/** Claim due settings and persist the occurrence in the same statement. */
export async function claimDueMorningBriefs(now = new Date()) {
  const due = await getDb().select().from(morningBriefSettings).where(and(eq(morningBriefSettings.enabled, true), lte(morningBriefSettings.nextRunAt, now))).orderBy(morningBriefSettings.nextRunAt).limit(50);
  for (const setting of due) {
    if (!setting.nextRunAt) continue;
    const input: BriefSettingsInput = { enabled: setting.enabled, time: setting.time, timezone: setting.timezone, weekends: setting.weekends, sections: setting.sections };
    const next = nextBriefAt(input, new Date(Math.max(now.getTime(), setting.nextRunAt.getTime()) + 60_000));
    const late = now.getTime() - setting.nextRunAt.getTime() > FRESH_MS;
    const day = briefLocalDay(setting.nextRunAt, setting.timezone);
    await getDb().execute(sql`
      WITH claimed AS (
        UPDATE morning_brief_settings SET next_run_at=${next}, updated_at=now()
        WHERE clerk_user_id=${setting.clerkUserId} AND enabled=true AND next_run_at=${setting.nextRunAt}
        RETURNING clerk_user_id
      ) INSERT INTO morning_briefs(clerk_user_id, local_day, timezone, scheduled_for, status)
        SELECT clerk_user_id, ${day}, ${setting.timezone}, ${setting.nextRunAt}, ${late ? "skipped" : "queued"} FROM claimed
        ON CONFLICT (clerk_user_id, local_day) DO NOTHING
    `);
  }
}

/** An expired worker can resume; Trigger submission is retried by the minute dispatcher. */
export async function publishMorningBriefs(now = new Date()) {
  await getDb().update(morningBriefs).set({ status: "queued", leaseUntil: null }).where(and(eq(morningBriefs.status, "running"), lte(morningBriefs.leaseUntil, now), lt(morningBriefs.attempts, 3)));
  await getDb().update(morningBriefs).set({ status: "failed", leaseUntil: null, error: "Brief generation did not finish" }).where(and(eq(morningBriefs.status, "running"), lte(morningBriefs.leaseUntil, now), gte(morningBriefs.attempts, 3)));
  const queued = await getDb().select({ id: morningBriefs.id, userId: morningBriefs.clerkUserId, attempts: morningBriefs.attempts }).from(morningBriefs).where(eq(morningBriefs.status, "queued")).orderBy(morningBriefs.scheduledFor).limit(20);
  if (!queued.length) return;
  await tasks.batchTrigger<typeof morningBriefJob>("mate-morning-brief", queued.map((brief) => ({
    payload: { briefId: brief.id },
    options: { idempotencyKey: `morning_brief_${brief.id}_${brief.attempts}`, concurrencyKey: brief.userId, ttl: "2h" },
  })));
}

/** One worker run. Stable message ID and saved lines make interrupted attempts safe to resume. */
export async function executeMorningBrief(briefId: string, now = new Date()) {
  const [brief] = await getDb().update(morningBriefs).set({ status: "running", attempts: sql`${morningBriefs.attempts} + 1`, leaseUntil: new Date(now.getTime() + 3 * 60_000), updatedAt: now })
    .where(and(eq(morningBriefs.id, briefId), eq(morningBriefs.status, "queued"))).returning();
  if (!brief) return;
  try {
    const [setting] = await getDb().select().from(morningBriefSettings).where(eq(morningBriefSettings.clerkUserId, brief.clerkUserId)).limit(1);
    if (!setting?.enabled || now.getTime() - brief.scheduledFor.getTime() > FRESH_MS) {
      await getDb().update(morningBriefs).set({ status: "skipped", leaseUntil: null, updatedAt: new Date() }).where(eq(morningBriefs.id, brief.id));
      return;
    }
    let lines: BriefLine[] = brief.lines ?? [];
    if (!brief.lines) {
      const candidates = await collectBriefCandidates(brief.clerkUserId, brief.scheduledFor, brief.timezone, setting.sections.filter((section) => !setting.mutedSections.includes(section)), setting.commuteOrigin);
      const weekend = DateTime.fromJSDate(brief.scheduledFor).setZone(brief.timezone).weekday > 5;
      lines = await composeBriefLines(brief.clerkUserId, brief.id, candidates, weekend && setting.weekends === "light");
      await getDb().update(morningBriefs).set({ lines, updatedAt: new Date() }).where(eq(morningBriefs.id, brief.id));
    }
    if (!lines.length) {
      await getDb().update(morningBriefs).set({ status: "skipped", leaseUntil: null, updatedAt: new Date() }).where(eq(morningBriefs.id, brief.id));
      return;
    }
    const mate = await ensureDefaultMate(brief.clerkUserId);
    const chatId = mateChatId(mate.id);
    const messageId = `brief_${brief.id}`;
    const [head] = await getDb().select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.chatId, chatId)).orderBy(desc(chatMessages.createdAt)).limit(1);
    const createdAt = new Date();
    const message = {
      id: messageId, role: "assistant", createdAt: createdAt.toISOString(),
      content: [{ type: "text", text: ["Your morning", ...lines.map((line) => line.text)].join("\n") }],
      status: { type: "complete", reason: "stop" },
      metadata: { custom: { morningBrief: { id: brief.id, localDay: brief.localDay, lines } } },
    };
    const deferredIds = lines.flatMap((line) => line.section === "deferred" && line.id.startsWith("deferred:") ? [line.id.slice("deferred:".length)] : []);
    await getDb().batch([
      getDb().insert(chatMessages).values({ chatId, id: messageId, parentId: head?.id ?? null, message }).onConflictDoNothing(),
      getDb().update(chats).set({ updatedAt: createdAt }).where(eq(chats.id, chatId)),
      getDb().update(morningBriefs).set({ status: "posted", chatId, leaseUntil: null, error: null, updatedAt: createdAt }).where(eq(morningBriefs.id, brief.id)),
      ...(deferredIds.length ? [getDb().update(proactiveNotifications).set({ status: "included", updatedAt: createdAt }).where(and(inArray(proactiveNotifications.id, deferredIds), eq(proactiveNotifications.status, "brief")))] : []),
    ]);
  } catch (error) {
    await getDb().update(morningBriefs).set({ status: brief.attempts >= 3 ? "failed" : "queued", leaseUntil: null, error: (error instanceof Error ? error.message : String(error)).slice(0, 500), updatedAt: new Date() }).where(eq(morningBriefs.id, brief.id));
    throw error;
  }
}

/** Claim the push before sending, so a timeout cannot produce a second notification. */
export async function sendPendingMorningPushes(now = new Date()) {
  await getDb().update(morningBriefs).set({ error: "Push window expired before notification" }).where(and(eq(morningBriefs.status, "posted"), isNull(morningBriefs.pushAttemptedAt), isNull(morningBriefs.error), lt(morningBriefs.scheduledFor, new Date(now.getTime() - PUSH_WINDOW_MS))));
  const ready = await getDb().select().from(morningBriefs).where(and(eq(morningBriefs.status, "posted"), isNull(morningBriefs.pushAttemptedAt), gte(morningBriefs.scheduledFor, new Date(now.getTime() - PUSH_WINDOW_MS)))).orderBy(morningBriefs.scheduledFor).limit(20);
  for (const brief of ready) {
    if (!brief.chatId || !brief.lines?.length) continue;
    const [claimed] = await getDb().update(morningBriefs).set({ pushAttemptedAt: now }).where(and(eq(morningBriefs.id, brief.id), isNull(morningBriefs.pushAttemptedAt))).returning({ id: morningBriefs.id });
    if (!claimed) continue;
    try {
      const mate = await ensureDefaultMate(brief.clerkUserId);
      await pushProactiveToUser({ userId: brief.clerkUserId, mateId: mate.id, sourceKey: `morning-brief:${brief.id}`, title: "Your morning", body: brief.lines[0]!.text, data: { chatId: brief.chatId, chatKind: "mate", morningBriefId: brief.id } }, now);
    } catch (error) {
      // The provider might have accepted the push before a later failure. Do not retry blindly.
      await getDb().update(morningBriefs).set({ error: `Push outcome unknown: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500) }).where(eq(morningBriefs.id, brief.id));
    }
  }
}

/** The minute dispatcher only claims and submits work; the model runs in a separate task. */
export async function dispatchMorningBriefs(now = new Date()) {
  await claimDueMorningBriefs(now);
  await publishMorningBriefs(now);
  await sendPendingMorningPushes(now);
}
