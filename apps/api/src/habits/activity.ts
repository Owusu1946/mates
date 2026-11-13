import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { actionTier } from "../action-policy.js";
import { getDb } from "../db/client.js";
import { activityEvents, agentRuns, type ActivityKind } from "../db/schema.js";
import { learningFor, localParts, SENSITIVE, structured, userTimezone } from "./shared.js";

/**
 * The activity log habits are learned from. Metadata only (a normalised task, labels, tool names,
 * a topic), never message bodies. Every write is best-effort: learning must never break the work.
 */

const KEEP_DAYS = 90;

export type ActivityInput = {
  userId: string;
  kind: ActivityKind;
  at?: Date;
  timezone?: string | null;
  mateId?: string | null;
  chatId?: string | null;
  taskKey?: string | null;
  label?: string;
  toolkit?: string | null;
  slug?: string | null;
  ref?: string | null;
  topic?: string | null;
};

export async function recordActivity(rows: ActivityInput[]) {
  if (!rows.length) return;
  try {
    const timezone = await userTimezone(rows[0]!.userId, rows[0]!.timezone);
    await getDb()
      .insert(activityEvents)
      .values(
        rows.map((row) => {
          const at = row.at ?? new Date();
          return {
            clerkUserId: row.userId,
            mateId: row.mateId ?? null,
            chatId: row.chatId ?? null,
            at,
            ...localParts(at, row.timezone ?? timezone),
            timezone: row.timezone ?? timezone,
            kind: row.kind,
            taskKey: row.taskKey ?? null,
            label: (row.label ?? "").slice(0, 160),
            toolkit: row.toolkit ?? null,
            slug: row.slug ?? null,
            ref: row.ref ?? null,
            topic: row.topic?.toLowerCase().slice(0, 60) ?? null,
          };
        }),
      );
  } catch (error) {
    console.warn("activity_record_failed", { message: error instanceof Error ? error.message : String(error) });
  }
}

/** The tool slugs a run used: plain tool calls and the apps called through Composio. */
export function toolsUsed(messages: Record<string, unknown>[]) {
  const slugs: string[] = [];
  for (const message of messages) {
    for (const call of (message.tool_calls as { function?: { name?: string; arguments?: string } }[] | undefined) ?? []) {
      const name = call.function?.name ?? "";
      if (name === "COMPOSIO_MULTI_EXECUTE_TOOL") {
        try {
          const args = JSON.parse(call.function?.arguments ?? "{}") as { tools?: { tool_slug?: string }[] };
          for (const tool of args.tools ?? []) if (tool.tool_slug) slugs.push(tool.tool_slug);
        } catch {}
      } else if (name && !name.startsWith("COMPOSIO_")) slugs.push(name);
    }
  }
  return [...new Set(slugs)];
}

const ASK_SCHEMA = {
  type: "object",
  properties: {
    task_key: { type: "string" },
    label: { type: "string" },
    topic: { type: ["string", "null"] },
  },
  required: ["task_key", "label", "topic"],
  additionalProperties: false,
};

/** The user's recent task keys, so the same task keeps the same key over time. */
async function knownKeys(userId: string) {
  const rows = await getDb()
    .select({ taskKey: activityEvents.taskKey, uses: sql<number>`count(*)::int` })
    .from(activityEvents)
    .where(and(eq(activityEvents.clerkUserId, userId), isNotNull(activityEvents.taskKey), gte(activityEvents.at, new Date(Date.now() - 56 * 86_400_000))))
    .groupBy(activityEvents.taskKey)
    .orderBy(desc(sql`count(*)`))
    .limit(60);
  return rows.map((r) => r.taskKey!).filter(Boolean);
}

/**
 * After a run the user asked for: one small call names the task ("plan_week") so repeats line up,
 * plus a topic if the ask was about one; and each app action the mates took is logged.
 */
export async function recordRunActivity(input: { userId: string; runId: string; agentRunId: string | null; chatId: string | null; mateId?: string | null; userText: string; timezone?: string | null; at?: Date }) {
  const learning = await learningFor(input.userId).catch(() => null);
  if (!learning?.habits || input.userText.trim().length < 3) return;
  const [agent] = input.agentRunId ? await getDb().select({ messages: agentRuns.messages }).from(agentRuns).where(eq(agentRuns.id, input.agentRunId)) : [];
  const tools = toolsUsed((agent?.messages as Record<string, unknown>[] | undefined) ?? []);
  const keys = await knownKeys(input.userId);
  let named: { task_key: string; label: string; topic: string | null };
  try {
    named = await structured(
      "activity_ask",
      ASK_SCHEMA,
      [
        {
          role: "system",
          content: `Name the task a user asked their assistant to do, so the same task gets the same name each time it comes up.
- task_key: snake_case, 2-4 words, about the task not its details ("plan_week", "email_meeting_recap", "check_btc_price"). Reuse one of the existing keys if it's the same task: ${keys.join(", ") || "(none yet)"}.
- label: a short plain description ("Plan the week").
- topic: the subject they keep an eye on, if any ("bitcoin", "fintech in ghana", "arsenal"), else null. Never a topic about ${SENSITIVE}.`,
        },
        { role: "user", content: `Request: ${input.userText.slice(0, 800)}\nTools used: ${tools.join(", ") || "none"}` },
      ],
      { userId: input.userId, source: "habit", ref: input.runId },
      200,
    );
  } catch {
    return;
  }
  const taskKey = z.string().regex(/^[a-z0-9_]{2,60}$/).safeParse(named.task_key).success ? named.task_key : null;
  const shared = { userId: input.userId, chatId: input.chatId, mateId: input.mateId ?? null, timezone: input.timezone, ref: input.runId, at: input.at };
  await recordActivity([
    { ...shared, kind: "ask", taskKey, label: named.label, topic: named.topic },
    ...tools.filter((slug) => slug === slug.toUpperCase() && actionTier(slug) === "write").map((slug) => ({ ...shared, kind: "app_action" as const, slug, toolkit: slug.split("_")[0]!.toLowerCase(), label: slug.toLowerCase().replace(/_/g, " ") })),
  ]);
}

/** What the app reports the user opened: feed results, decks, notes, links. */
export const readEventSchema = z.object({
  type: z.enum(["feed", "deck", "call_notes", "meeting_notes", "link", "watch", "nudge"]),
  ref: z.string().max(200).optional(),
  label: z.string().max(160).default(""),
  topic: z.string().max(60).optional(),
  chatId: z.string().max(200).optional(),
  at: z.string().datetime().optional(),
});

export async function recordReads(userId: string, events: z.infer<typeof readEventSchema>[]) {
  const learning = await learningFor(userId).catch(() => null);
  if (!learning?.habits) return;
  await recordActivity(events.slice(0, 50).map((e) => ({ userId, kind: "read" as const, slug: e.type, ref: e.ref ?? null, label: e.label, topic: e.topic ?? null, chatId: e.chatId ?? null, at: e.at ? new Date(e.at) : undefined })));
}

/** Whether a task was already done today in the user's timezone (so a nudge would be pointless). */
export async function doneToday(userId: string, taskKey: string, timezone: string, now = new Date()) {
  const { DateTime } = await import("luxon");
  const start = DateTime.fromJSDate(now).setZone(timezone).startOf("day").toJSDate();
  const [row] = await getDb()
    .select({ id: activityEvents.id })
    .from(activityEvents)
    .where(and(eq(activityEvents.clerkUserId, userId), eq(activityEvents.taskKey, taskKey), gte(activityEvents.at, start), inArray(activityEvents.kind, ["ask", "app_action"])))
    .limit(1);
  return !!row;
}

/** Drops activity older than 90 days (the dispatcher calls it now and then). */
export async function pruneActivity(now = new Date()) {
  await getDb().delete(activityEvents).where(lt(activityEvents.at, new Date(now.getTime() - KEEP_DAYS * 86_400_000)));
}
