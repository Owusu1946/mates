import { DateTime, IANAZone } from "luxon";
import { randomUUID } from "node:crypto";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { chats, delegations, routineOccurrences, routines } from "./db/schema.js";
import { createChatStore } from "./chats.js";
import { publishOutbox, submitRun, workerConfigured } from "./durable-runs.js";

export const routineSpecSchema = z.object({
  title: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(4000),
  frequency: z.enum(["once", "daily", "weekly"]),
  timezone: z.string().refine(value => IANAZone.isValidZone(value), "Choose a valid IANA timezone"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekday: z.number().int().min(1).max(7).nullable(),
  onceAt: z.string().datetime({ offset: true }).nullable(),
}).superRefine((value, ctx) => {
  if (value.frequency === "weekly" && !value.weekday) ctx.addIssue({ code: "custom", message: "Choose a weekday" });
  if (value.frequency === "once" && !value.onceAt) ctx.addIssue({ code: "custom", message: "Choose the exact date and time" });
});
export type RoutineSpec = z.infer<typeof routineSpecSchema>;

export function nextOccurrence(spec: RoutineSpec, after = new Date()): Date | null {
  if (spec.frequency === "once") {
    const date = new Date(spec.onceAt!);
    return date.getTime() > after.getTime() ? date : null;
  }
  const local = DateTime.fromJSDate(after, { zone: spec.timezone });
  const [hour, minute] = spec.time.split(":").map(Number);
  for (let day = 0; day < 15; day++) {
    const calendar = local.plus({ days: day });
    if (spec.frequency === "weekly" && calendar.weekday !== spec.weekday) continue;
    let candidate = DateTime.fromObject({ year: calendar.year, month: calendar.month, day: calendar.day, hour, minute }, { zone: spec.timezone });
    // Skip nonexistent wall times; choose the first occurrence on an ambiguous day.
    if (!candidate.isValid || candidate.hour !== hour || candidate.minute !== minute) continue;
    const options = candidate.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis());
    candidate = options[0] ?? candidate;
    if (candidate.toMillis() > after.getTime()) return candidate.toJSDate();
  }
  throw new Error("The next occurrence could not be calculated");
}

export const scheduleInstructions = `For requests to do work later or repeatedly, call cooper_schedule_draft after clarifying missing date, local time, timezone or task details. The user's timezone is given below; use it unless they name another. Support once, daily and weekly. Weekdays are ISO Monday=1 through Sunday=7. onceAt must include a UTC offset. Show a draft, never claim a routine is active before explicit confirmation. Routines deliver results in this chat; external email/Slack delivery still requires per-run approval and is not standing consent. Conditional monitoring (only notify on change or below a threshold) is not supported yet: explain that and ask whether unconditional checking is acceptable before drafting. Do not silently drop the requested condition. Never turn an ordinary question into a routine.`;
/** The phone's timezone when known; Accra is only the fallback for older clients. */
export function scheduleContext(timezone?: string) {
  const zone = timezone && IANAZone.isValidZone(timezone) ? timezone : "Africa/Accra";
  const local = DateTime.now().setZone(zone).toFormat("cccc d LLLL yyyy, HH:mm");
  return `${scheduleInstructions} The user's timezone is ${zone}; their local time is ${local}. Current UTC time is ${new Date().toISOString()}. Use this exact clock when resolving relative dates and requests such as in five minutes; do not guess today's date. Write times for the user in their timezone and pass that timezone to apps.`;
}
export const scheduleTool = { type: "function" as const, function: { name: "cooper_schedule_draft", description: "Create a schedule draft with the next concrete occurrence; the user must press Confirm before it runs. No external-action consent is granted.", parameters: z.toJSONSchema(routineSpecSchema) } };

export async function draftRoutine(userId: string, spec: RoutineSpec, chatId?: string) {
  if (chatId && !(await createChatStore().get(userId, chatId))) throw new Error("Chat not found");
  const nextRunAt = nextOccurrence(spec);
  if (!nextRunAt) throw new Error("Choose a future date and time");
  const [draft] = await getDb().insert(routines).values({ clerkUserId: userId, chatId, title: spec.title, spec: spec as unknown as Record<string, unknown>, nextRunAt }).returning();
  return draft!;
}

export async function listRoutines(userId: string) {
  return getDb().select().from(routines).where(eq(routines.clerkUserId, userId)).orderBy(desc(routines.createdAt)).limit(100);
}

export async function changeRoutine(userId: string, id: string, action: "confirm" | "pause" | "resume" | "cancel", expectedVersion: number) {
  const [routine] = await getDb().select().from(routines).where(and(eq(routines.id, id), eq(routines.clerkUserId, userId)));
  if (!routine || routine.version !== expectedVersion) throw new Error("ROUTINE_CONFLICT");
  const allowed = action === "confirm" ? ["draft"] : action === "pause" ? ["active"] : action === "resume" ? ["paused"] : ["draft", "active", "paused"];
  if (!allowed.includes(routine.status)) throw new Error("ROUTINE_CONFLICT");
  if (["confirm", "resume"].includes(action) && !workerConfigured()) throw new Error("WORKER_NOT_CONFIGURED");
  const nextRunAt = ["confirm", "resume"].includes(action) ? nextOccurrence(routineSpecSchema.parse(routine.spec)) : routine.nextRunAt;
  if (["confirm", "resume"].includes(action) && !nextRunAt) throw new Error("Choose a future time");
  return (await getDb().update(routines).set({ status: action === "pause" ? "paused" : action === "cancel" ? "cancelled" : "active", nextRunAt, version: routine.version + 1, updatedAt: new Date() }).where(and(eq(routines.id, id), eq(routines.clerkUserId, userId), eq(routines.version, expectedVersion), eq(routines.status, routine.status))).returning())[0] ?? null;
}

export async function editRoutine(userId: string, id: string, spec: RoutineSpec, version: number) {
  const nextRunAt = nextOccurrence(spec);
  if (!nextRunAt) throw new Error("Choose a future time");
  // Editing always returns to draft so changed work needs renewed confirmation.
  return (await getDb().update(routines).set({ spec: spec as unknown as Record<string, unknown>, title: spec.title, status: "draft", version: version + 1, nextRunAt, updatedAt: new Date() }).where(and(eq(routines.id, id), eq(routines.clerkUserId, userId), eq(routines.version, version))).returning())[0] ?? null;
}

export async function routineHistory(userId: string, id: string) {
  const [routine] = await getDb().select().from(routines).where(and(eq(routines.id, id), eq(routines.clerkUserId, userId)));
  if (!routine) return null;
  return getDb().select({ id: delegations.id, scheduledFor: routineOccurrences.scheduledFor, status: delegations.status, error: delegations.error, updatedAt: delegations.updatedAt }).from(routineOccurrences).innerJoin(delegations, eq(delegations.id, routineOccurrences.delegationId)).where(eq(routineOccurrences.routineId, id)).orderBy(desc(routineOccurrences.scheduledFor)).limit(50);
}

export async function runRoutineNow(userId: string, id: string, requestKey: string) {
  const [routine] = await getDb().select().from(routines).where(and(eq(routines.id, id), eq(routines.clerkUserId, userId)));
  if (!routine || !["active", "paused"].includes(routine.status)) throw new Error("ROUTINE_CONFLICT");
  const spec = routineSpecSchema.parse(routine.spec);
  const chatId = `routine_${id}_${requestKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50)}`;
  const parentId = `user_${requestKey}`;
  // The routine speaks as the mate (or group leader) whose chat drafted it.
  const [source] = routine.chatId ? await getDb().select({ mateId: chats.mateId, leaderMateId: chats.leaderMateId }).from(chats).where(eq(chats.id, routine.chatId)) : [];
  await createChatStore().initialize(userId, chatId, "routine", source?.mateId ?? source?.leaderMateId ?? null);
  const run = await submitRun(userId, { chatId, parentId, assistantMessageId: `assistant_${requestKey}`, requestKey: `manual_${id}_${requestKey}`, messages: [{ role: "user", content: scheduledPrompt(spec) }] });
  await getDb().insert(routineOccurrences).values({ routineId: id, version: routine.version, scheduledFor: run.createdAt, delegationId: run.id }).onConflictDoNothing();
  return run;
}

function scheduledPrompt(spec: RoutineSpec) {
  return `Scheduled routine: ${spec.prompt}\nRun the task now. Deliver the findings here in this chat. This routine does not grant permission for external writes. Pause and request approval for any external mutation.`;
}

export async function dispatchDueRoutines() {
  if (!workerConfigured()) return;
  const now = new Date();
  const due = await getDb().select().from(routines).where(and(eq(routines.status, "active"), lte(routines.nextRunAt, now))).limit(50);
  for (const routine of due) {
    const spec = routineSpecSchema.parse(routine.spec);
    const next = nextOccurrence(spec, now); // Coalesce missed occurrences into one useful run.
    const id = randomUUID();
    const chatId = `routine_${id}`;
    const prompt = scheduledPrompt(spec);
    const request = { messages: [{ role: "user", content: prompt }], chatId, requestKey: `occurrence_${routine.id}_${routine.version}_${routine.nextRunAt!.toISOString()}`, parentId: `user_${id}`, assistantMessageId: `assistant_${id}` };
    await claimRoutineOccurrence(routine, next, id, chatId, prompt, request, now);
  }
  await publishOutbox();
}

// Claim, occurrence, user message, job and submission outbox are one SQL transaction.
export async function claimRoutineOccurrence(routine: typeof routines.$inferSelect, next: Date | null, id: string, chatId: string, prompt: string, request: Record<string, unknown> & { requestKey: string; assistantMessageId: string; parentId: string }, now: Date) {
    await getDb().execute(sql`
      WITH claimed AS (
        UPDATE routines SET next_run_at=${next}, status=${next ? "active" : "finished"}, updated_at=now()
        WHERE id=${routine.id} AND version=${routine.version} AND status='active' AND next_run_at=${routine.nextRunAt}
        RETURNING id,clerk_user_id,version
      ), thread AS (
        INSERT INTO chats(id,clerk_user_id,title,kind,leader_mate_id)
        SELECT ${chatId},clerk_user_id,${routine.title},'routine',(SELECT COALESCE(mate_id, leader_mate_id) FROM chats WHERE id=${routine.chatId}) FROM claimed RETURNING id
      ), job AS (
        INSERT INTO delegations(id,clerk_user_id,chat_id,request_key,request_hash,request,assistant_message_id,parent_id,agent_run_id)
        SELECT ${id}::uuid,c.clerk_user_id,t.id,${request.requestKey},${request.requestKey},${JSON.stringify(request)}::jsonb,${request.assistantMessageId},${request.parentId},${id}::uuid FROM claimed c CROSS JOIN thread t RETURNING id
      ), occurrence AS (
        INSERT INTO routine_occurrences(routine_id,scheduled_for,version,delegation_id)
        SELECT c.id,${routine.nextRunAt},c.version,j.id FROM claimed c CROSS JOIN job j
      ), message AS (
        INSERT INTO chat_messages(chat_id,id,message) SELECT t.id,${request.parentId},${JSON.stringify({ id: request.parentId, role: "user", createdAt: now.toISOString(), content: [{ type: "text", text: prompt }] })}::jsonb FROM thread t
      ) INSERT INTO submission_outbox(delegation_id) SELECT id FROM job
    `);
}
