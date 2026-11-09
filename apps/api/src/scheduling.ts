import { DateTime, IANAZone } from "luxon";
import { randomUUID } from "node:crypto";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { chatMessages, chats, delegations, routineOccurrences, routines } from "./db/schema.js";
import { createChatStore } from "./chats.js";
import { publishOutbox, submitRun, workerConfigured } from "./durable-runs.js";
import { ensureDefaultMate, mateChatId } from "./mates.js";

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

export const scheduleInstructions = `For requests to do work later or on a repeat, call cooper_schedule_draft. Ask a short question only when the time or the task is genuinely missing. The user asking is the decision: the routine is active as soon as you call the tool, so never ask them to confirm it, and tell them when it next runs. Write the prompt as the task to do each time, keeping every action the user asked for (who to email, what to draft or send). It runs in this chat, as you, and the user is notified. The user's timezone is given below; use it unless they name another. Support once, daily and weekly. Weekdays are ISO Monday=1 through Sunday=7. onceAt must include a UTC offset. Conditional monitoring (only notify on change or below a threshold) is not supported yet: explain that and ask whether unconditional checking is acceptable. Do not silently drop the requested condition. Never turn an ordinary question into a routine.`;
/** The phone's timezone when known; Accra is only the fallback for older clients. */
export function scheduleContext(timezone?: string) {
  const zone = timezone && IANAZone.isValidZone(timezone) ? timezone : "Africa/Accra";
  const local = DateTime.now().setZone(zone).toFormat("cccc d LLLL yyyy, HH:mm");
  return `${scheduleInstructions} The user's timezone is ${zone}; their local time is ${local}. Current UTC time is ${new Date().toISOString()}. Use this exact clock when resolving relative dates and requests such as in five minutes; do not guess today's date. Write times for the user in their timezone and pass that timezone to apps.`;
}
export const scheduleTool = { type: "function" as const, function: { name: "cooper_schedule_draft", description: "Schedule work for later or on a repeat. It is active at once and runs in this chat; the user can pause or cancel it from the card.", parameters: z.toJSONSchema(routineSpecSchema) } };

/** A routine as the user asked for it in chat: active at once, keeping their own words as its scope. */
export async function scheduleRoutine(userId: string, spec: RoutineSpec, chatId: string | undefined, request: string) {
  if (!workerConfigured()) throw new Error("Scheduled work isn't available right now.");
  if (chatId && !(await createChatStore().get(userId, chatId))) throw new Error("Chat not found");
  const nextRunAt = nextOccurrence(spec);
  if (!nextRunAt) throw new Error("Choose a future date and time");
  const stored = { ...spec, request: request.trim().slice(0, 2000) };
  const [routine] = await getDb().insert(routines).values({ clerkUserId: userId, chatId, title: spec.title, spec: stored, status: "active", nextRunAt }).returning();
  return routine!;
}

/**
 * Where a routine's runs go: the mate or group chat it was set up in, so that mate does the
 * work under its own name and look. Anything else (older chats, a deleted chat) goes to the
 * lead mate's chat.
 */
export async function routineChat(userId: string, chatId: string | null): Promise<string> {
  if (chatId) {
    const [chat] = await getDb().select({ kind: chats.kind }).from(chats).where(and(eq(chats.id, chatId), eq(chats.clerkUserId, userId)));
    if (chat && (chat.kind === "mate" || chat.kind === "group")) return chatId;
  }
  return mateChatId((await ensureDefaultMate(userId)).id);
}

/** The run's user turn: shown in the app as a small "scheduled" marker rather than a message. */
export function routineMessage(id: string, routine: { id: string; title: string }, prompt: string, createdAt: Date) {
  return { id, role: "user", createdAt: createdAt.toISOString(), content: [{ type: "text", text: prompt }], metadata: { custom: { routine: { id: routine.id, title: routine.title } } } };
}

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
  const prompt = scheduledPrompt(spec, requestOf(routine));
  const chatId = await routineChat(userId, routine.chatId);
  const parentId = `user_${requestKey}`;
  // The marker joins the chat after its newest message; submitRun keeps this row as is.
  const [head] = await getDb().select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.chatId, chatId)).orderBy(desc(chatMessages.createdAt)).limit(1);
  await getDb().insert(chatMessages).values({ chatId, id: parentId, parentId: head?.id ?? null, message: routineMessage(parentId, routine, prompt, new Date()) }).onConflictDoNothing();
  const run = await submitRun(userId, { chatId, parentId, assistantMessageId: `assistant_${requestKey}`, requestKey: `manual_${id}_${requestKey}`, messages: [{ role: "user", content: prompt }] });
  await getDb().insert(routineOccurrences).values({ routineId: id, version: routine.version, scheduledFor: run.createdAt, delegationId: run.id }).onConflictDoNothing();
  return run;
}

/** The user's own words from when they set the routine up, if it was set up in chat. */
const requestOf = (routine: { spec: Record<string, unknown> }) => (typeof routine.spec.request === "string" ? routine.spec.request : "");

/**
 * The scheduled run's instructions. The user's request is standing consent for exactly what it
 * describes, so the run doesn't stop to ask; anything beyond it still needs the user.
 */
export function scheduledPrompt(spec: RoutineSpec, request = "") {
  return [
    `Scheduled task "${spec.title}", which the user set up: ${spec.prompt}`,
    request ? `The user's own words when they set it up: "${request}"` : "",
    "Do it now and post the result here. This is the user's standing request: carry out the actions it describes, such as drafting or sending the email it names, without asking for confirmation. Do not take external actions it does not describe; if one seems needed, explain why and ask.",
  ].filter(Boolean).join("\n");
}

export async function dispatchDueRoutines() {
  if (!workerConfigured()) return;
  const now = new Date();
  const due = await getDb().select().from(routines).where(and(eq(routines.status, "active"), lte(routines.nextRunAt, now))).limit(50);
  for (const routine of due) {
    // One routine failing (e.g. its chat is mid-run, so it retries next tick) never blocks the rest.
    try {
      const spec = routineSpecSchema.parse(routine.spec);
      const next = nextOccurrence(spec, now); // Coalesce missed occurrences into one useful run.
      const id = randomUUID();
      const chatId = await routineChat(routine.clerkUserId, routine.chatId);
      const prompt = scheduledPrompt(spec, requestOf(routine));
      const request = { messages: [{ role: "user", content: prompt }], chatId, requestKey: `occurrence_${routine.id}_${routine.version}_${routine.nextRunAt!.toISOString()}`, parentId: `user_${id}`, assistantMessageId: `assistant_${id}` };
      await claimRoutineOccurrence(routine, next, id, chatId, prompt, request, now);
    } catch (error) {
      console.warn("routine_dispatch_failed", { routineId: routine.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  await publishOutbox();
}

// Claim, occurrence, user message, job and submission outbox are one SQL transaction. The run joins
// the routine's chat after its newest message (read before this statement's own insert).
export async function claimRoutineOccurrence(routine: typeof routines.$inferSelect, next: Date | null, id: string, chatId: string, prompt: string, request: Record<string, unknown> & { requestKey: string; assistantMessageId: string; parentId: string }, now: Date) {
    await getDb().execute(sql`
      WITH claimed AS (
        UPDATE routines SET next_run_at=${next}, status=${next ? "active" : "finished"}, updated_at=now()
        WHERE id=${routine.id} AND version=${routine.version} AND status='active' AND next_run_at=${routine.nextRunAt}
        RETURNING id,clerk_user_id,version
      ), thread AS (
        UPDATE chats SET updated_at=now() WHERE id=${chatId} AND clerk_user_id=${routine.clerkUserId} AND EXISTS (SELECT 1 FROM claimed) RETURNING id
      ), job AS (
        INSERT INTO delegations(id,clerk_user_id,chat_id,request_key,request_hash,request,assistant_message_id,parent_id,agent_run_id)
        SELECT ${id}::uuid,c.clerk_user_id,t.id,${request.requestKey},${request.requestKey},${JSON.stringify(request)}::jsonb,${request.assistantMessageId},${request.parentId},${id}::uuid FROM claimed c CROSS JOIN thread t RETURNING id
      ), occurrence AS (
        INSERT INTO routine_occurrences(routine_id,scheduled_for,version,delegation_id)
        SELECT c.id,${routine.nextRunAt},c.version,j.id FROM claimed c CROSS JOIN job j
      ), message AS (
        INSERT INTO chat_messages(chat_id,id,parent_id,message)
        SELECT t.id,${request.parentId},(SELECT id FROM chat_messages WHERE chat_id=${chatId} ORDER BY created_at DESC LIMIT 1),${JSON.stringify(routineMessage(request.parentId, routine, prompt, now))}::jsonb FROM thread t
      ) INSERT INTO submission_outbox(delegation_id) SELECT id FROM job
    `);
}
