import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { tasks, idempotencyKeys } from "@trigger.dev/sdk";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { agentRuns, chatMessages, chats, delegations, findings, missions, runEvents, submissionOutbox } from "./db/schema.js";
import { chatRequestSchema, requestChatCompletion } from "./chat.js";
import { createChatStore, chatIdSchema } from "./chats.js";
import { createAgentResponse } from "./agent-chat.js";
import { linkAttachments } from "./attachments.js";
import { personaPreamble, resolvePersona, type Persona, type PersonaMate } from "./mates.js";
import { handoffCard, parseMentions, planGroupTurn, speakerCard, type Assignment, type HandoffStatus } from "./groups.js";
import { afterRunInChat, IDLE_ROUNDS_BEFORE_CHECKIN, notesTouchedSince, planMissionRound, yieldMissionRound } from "./missions.js";
import { pushToUser } from "./delivery.js";
import { extractMemories, memoryCard, memorySettings } from "./memory.js";
import { recordExchange } from "./recall.js";
import type { agentExecution } from "./trigger/agent.js";

export const submissionSchema = chatRequestSchema.extend({
  chatId: chatIdSchema,
  requestKey: z.string().min(8).max(160),
  assistantMessageId: chatIdSchema,
  parentId: chatIdSchema,
});
export type Submission = z.infer<typeof submissionSchema>;
export const terminalRun = (status: string) => ["completed", "failed", "cancelled", "waiting"].includes(status);
// Trigger supplies its environment key inside hosted workers; project ref is deploy-time configuration.
export const workerConfigured = () => process.env.COOPER_BACKGROUND_ENABLED === "true" && !!process.env.TRIGGER_SECRET_KEY;
const owner = (userId: string, id: string) => and(eq(delegations.id, id), eq(delegations.clerkUserId, userId));

export async function ownedRun(userId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) return undefined;
  return (await getDb().select().from(delegations).where(owner(userId, id)))[0];
}

export async function submitRun(userId: string, input: Submission) {
  if (!workerConfigured()) throw new Error("WORKER_NOT_CONFIGURED");
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const [existing] = await getDb().select().from(delegations).where(and(eq(delegations.clerkUserId, userId), eq(delegations.requestKey, input.requestKey)));
  if (existing) {
    if (existing.requestHash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
    return existing;
  }
  const store = createChatStore();
  if (!(await store.initialize(userId, input.chatId))) throw new Error("CHAT_NOT_FOUND");
  if (input.resumeRunId) {
    const [agent] = await getDb().select().from(agentRuns).where(and(eq(agentRuns.id, input.resumeRunId), eq(agentRuns.clerkUserId, userId)));
    if (!agent || !agent.status.startsWith("waiting")) throw new Error("RESUME_CONFLICT");
  }
  const id = randomUUID();
  const [previousMessage] = input.resumeRunId ? await getDb().select().from(chatMessages).where(and(eq(chatMessages.chatId, input.chatId), eq(chatMessages.id, input.assistantMessageId))) : [];
  const previousContent = Array.isArray(previousMessage?.message.content) ? previousMessage.message.content as Record<string, unknown>[] : [];
  const last = input.messages.at(-1);
  if (last?.role !== "user") throw new Error("INVALID_TURN");
  const title = (last.content || (last.attachments?.length ? "Shared a file" : "New chat")).slice(0, 60);
  // Who speaks is fixed when the message is sent, so editing or deleting a mate mid-run is harmless.
  const persona = await resolvePersona(userId, input.chatId);
  if (persona.kind === "group") await yieldMissionRound(input.chatId);
  try {
    await getDb().batch([
      getDb().insert(delegations).values({ id, clerkUserId: userId, chatId: input.chatId, requestKey: input.requestKey, requestHash: hash, request: { ...input, persona } as unknown as Record<string, unknown>, parentId: input.parentId, assistantMessageId: input.assistantMessageId, agentRunId: input.resumeRunId ?? id, content: previousContent }),
      getDb().insert(submissionOutbox).values({ delegationId: id }),
      getDb().insert(chatMessages).values({ chatId: input.chatId, id: input.parentId, message: { id: input.parentId, role: "user", createdAt: new Date().toISOString(), content: [{ type: "text", text: last.content }] } }).onConflictDoNothing(),
      // Database clock, like the user row above: a skewed API clock would sort the reply before its question.
      getDb().insert(chatMessages).values({ chatId: input.chatId, id: input.assistantMessageId, parentId: input.parentId, createdAt: sql`now() + interval '1 millisecond'`, message: { id: input.assistantMessageId, role: "assistant", createdAt: new Date(Date.now() + 1).toISOString(), content: previousContent.length ? previousContent : [{ type: "tool-call", toolCallId: `queued_${id}`, toolName: "cooper_workflow", args: {}, argsText: "{}", result: { kind: "step", phase: "running", label: "Starting", detail: "Your task is saved. You can leave the app." } }], metadata: { custom: { delegationId: id, resumed: !!input.resumeRunId } } } }).onConflictDoNothing(),
      getDb().update(chats).set({ updatedAt: new Date(), title: sql`CASE WHEN ${chats.title} = 'New chat' THEN ${title} ELSE ${chats.title} END` }).where(and(eq(chats.id, input.chatId), eq(chats.clerkUserId, userId))),
    ]);
  } catch (error) {
    const [raced] = await getDb().select().from(delegations).where(and(eq(delegations.clerkUserId, userId), eq(delegations.requestKey, input.requestKey)));
    if (raced?.requestHash === hash) return raced;
    const code = String((error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code);
    if (code === "23505") throw new Error("RUN_ALREADY_ACTIVE");
    throw error;
  }
  await linkAttachments(userId, input.chatId, last.attachments?.map((a) => a.id) ?? []).catch(() => {});
  await publishOutbox(id).catch(() => { console.warn("run_submission_deferred", { id }); });
  return (await ownedRun(userId, id))!;
}

export async function publishOutbox(onlyId?: string) {
  if (!workerConfigured()) return;
  // Use the database clock: default-now rows can otherwise appear briefly in the future on a laptop.
  const now = sql`now()`;
  const entries = await getDb().select().from(submissionOutbox).where(and(isNull(submissionOutbox.submittedAt), lte(submissionOutbox.nextAttemptAt, now), or(isNull(submissionOutbox.leaseUntil), lte(submissionOutbox.leaseUntil, now)), ...(onlyId ? [eq(submissionOutbox.delegationId, onlyId)] : []))).limit(25);
  for (const entry of entries) {
    const [claimed] = await getDb().update(submissionOutbox).set({ leaseUntil: sql`now() + interval '60 seconds'`, attempts: sql`${submissionOutbox.attempts} + 1` }).where(and(eq(submissionOutbox.delegationId, entry.delegationId), isNull(submissionOutbox.submittedAt), or(isNull(submissionOutbox.leaseUntil), lte(submissionOutbox.leaseUntil, now)))).returning();
    if (!claimed) continue;
    const [run] = await getDb().select().from(delegations).where(eq(delegations.id, entry.delegationId));
    if (!run || run.status !== "queued") {
      await getDb().update(submissionOutbox).set({ submittedAt: new Date(), leaseUntil: null }).where(eq(submissionOutbox.delegationId, entry.delegationId));
      continue;
    }
    try {
      const key = await idempotencyKeys.create(`cooper:${run.id}`, { scope: "global" });
      const handle = await tasks.trigger<typeof agentExecution>("cooper-agent", { delegationId: run.id }, { idempotencyKey: key, idempotencyKeyTTL: "30d", concurrencyKey: run.clerkUserId, ttl: "1h" });
      await getDb().batch([
        getDb().update(delegations).set({ providerRunId: handle.id }).where(eq(delegations.id, run.id)),
        getDb().update(submissionOutbox).set({ submittedAt: new Date(), leaseUntil: null }).where(eq(submissionOutbox.delegationId, run.id)),
      ]);
    } catch {
      console.warn("outbox_publish_failed", { id: run.id, attempt: claimed.attempts });
      await getDb().update(submissionOutbox).set({ leaseUntil: null, nextAttemptAt: new Date(Date.now() + Math.min(300_000, 1000 * 2 ** Math.min(claimed.attempts, 8))) }).where(eq(submissionOutbox.delegationId, run.id));
    }
  }
}

export async function runSnapshot(userId: string, id: string, after = 0) {
  const run = await ownedRun(userId, id);
  if (!run) return null;
  const events = await getDb().select({ sequence: runEvents.sequence, type: runEvents.type, payload: runEvents.payload, timestamp: runEvents.createdAt }).from(runEvents).where(and(eq(runEvents.delegationId, id), gt(runEvents.sequence, after))).orderBy(runEvents.sequence).limit(100);
  return { run: { id: run.id, chatId: run.chatId, status: run.status, agentRunId: run.agentRunId, sequence: run.sequence, content: run.content, error: run.error, assistantMessageId: run.assistantMessageId, parentId: run.parentId, createdAt: run.createdAt, updatedAt: run.updatedAt }, events };
}

export async function cancelRun(userId: string, id: string) {
  const run = await ownedRun(userId, id);
  if (!run) return false;
  await getDb().update(delegations).set({ cancelRequested: true, ...(run.status === "queued" ? { status: "cancelled" } : {}), updatedAt: new Date() }).where(and(owner(userId, id), inArray(delegations.status, ["queued", "running"])));
  return true;
}

type Content = Record<string, unknown>[];
function mergePayload(content: Content, payload: Record<string, unknown>) {
  const text = ((payload.choices as { delta?: { content?: string } }[] | undefined)?.[0]?.delta?.content);
  if (text) {
    const last = content.at(-1);
    if (last?.type === "text") last.text = String(last.text) + text;
    else content.push({ type: "text", text });
  }
  const tool = payload.cooper as { id: string; state: unknown } | undefined;
  if (tool) {
    const part = { type: "tool-call", toolCallId: tool.id, toolName: "cooper_workflow", args: {}, argsText: "{}", result: tool.state };
    const index = content.findIndex(p => p.type === "tool-call" && p.toolCallId === tool.id);
    if (index >= 0) content[index] = part; else content.push(part);
  }
}

export async function executeDelegation(id: string, workerSignal: AbortSignal) {
  const [run] = await getDb().update(delegations).set({ status: "running", heartbeatAt: new Date(), updatedAt: new Date() }).where(and(eq(delegations.id, id), eq(delegations.status, "queued"), eq(delegations.cancelRequested, false))).returning();
  if (!run) return;
  const request = chatRequestSchema.parse(run.request);
  const abort = new AbortController();
  const signal = AbortSignal.any([abort.signal, workerSignal, AbortSignal.timeout(10 * 60_000)]);
  let monitoring = false;
  let userCancelled = false;
  const heartbeat = setInterval(async () => {
    if (monitoring) return;
    monitoring = true;
    try {
      const [current] = await getDb().update(delegations).set({ heartbeatAt: new Date() }).where(eq(delegations.id, id)).returning({ cancel: delegations.cancelRequested, status: delegations.status });
      if (current?.cancel) { userCancelled = true; abort.abort(new Error("User cancelled")); }
      else if (!current || current.status !== "running") abort.abort(new Error("Run no longer active"));
    } catch { abort.abort(new Error("Run ownership could not be checked")); }
    finally { monitoring = false; }
  }, 2500);
  heartbeat.unref();
  let content: Content = structuredClone(run.content);
  let sequence = run.sequence;
  let status = "failed";
  let failure: string | null = null;
  let lastFlush = 0;
  const persist = async (type: string, finalStatus?: string) => {
    sequence++;
    const createdAt = new Date(run.createdAt.getTime() + 1).toISOString();
    const message = { id: run.assistantMessageId, role: "assistant", createdAt, content: structuredClone(content), metadata: { custom: { delegationId: id, resumed: !!request.resumeRunId } }, status: { type: finalStatus === "failed" ? "incomplete" : finalStatus ? "complete" : "running", ...(finalStatus ? { reason: finalStatus === "failed" ? "error" : "stop" } : {}) } };
    const statements = [
      getDb().update(delegations).set({ content: structuredClone(content), sequence, updatedAt: new Date(), ...(finalStatus ? { status: finalStatus, error: failure } : {}) }).where(eq(delegations.id, id)),
      getDb().insert(runEvents).values({ delegationId: id, sequence, type, payload: { content: structuredClone(content), status: finalStatus ?? "running", error: failure } }),
    ] as const;
    if (run.chatId) {
      // Owner and thread were checked at submission; FK deletion stops this insert.
      const thread = await createChatStore().get(run.clerkUserId, run.chatId);
      if (thread) {
        await getDb().batch([...statements, getDb().insert(chatMessages).values({ chatId: run.chatId, id: run.assistantMessageId, parentId: run.parentId, message, createdAt: new Date(createdAt) }).onConflictDoUpdate({ target: [chatMessages.chatId, chatMessages.id], set: { message } }), getDb().update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, run.chatId))]);
      } else await getDb().batch([...statements]);
    } else await getDb().batch([...statements]);
    lastFlush = Date.now();
  };
  // Routine runs claimed in SQL carry no snapshot; they resolve it now.
  const persona = (run.request as { persona?: Persona }).persona ?? (await resolvePersona(run.clerkUserId, run.chatId));
  /** Set when this run is one round of a group's mission rather than a reply to the user. */
  const missionInfo = (run.request as { mission?: { id: string; round: number } }).mission;
  let finishing = false;
  const consume = async (response: Response) => {
    if (!response.ok || !response.body) throw new Error("The agent could not start. Check server integrations.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let boundary = buffer.search(/\r?\n\r?\n/);
        while (boundary >= 0) {
          const event = buffer.slice(0, boundary);
          const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)![0];
          buffer = buffer.slice(boundary + separator.length);
          const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
          if (data && data !== "[DONE]") {
            const payload = JSON.parse(data) as Record<string, unknown>;
            if (payload.error) failure = "This request couldn’t finish. Earlier findings have been saved.";
            mergePayload(content, payload);
            if (Date.now() - lastFlush > 350 || payload.cooper) await persist("progress");
          }
          boundary = buffer.search(/\r?\n\r?\n/);
        }
        if (done) break;
      }
    } finally { reader.releaseLock(); }
  };
  /** One mate's turn through the shared agent, in its own agent-run row. */
  const runMate = (mate: PersonaMate, agentRunId: string, preamble: string, turns = request.messages, resume?: { resumeRunId?: string; choice?: string }) =>
    process.env.COMPOSIO_API_KEY
      ? createAgentResponse(turns, signal, run.clerkUserId, resume?.resumeRunId, resume?.choice, {
          runId: agentRunId,
          chatId: run.chatId ?? undefined,
          timezone: request.timezone,
          preamble,
          speaker: mate,
          checkpoint: async (pendingTool, history) => {
            await getDb().update(delegations).set({ pendingTool, heartbeatAt: new Date() }).where(eq(delegations.id, id));
            if (history) await getDb().update(agentRuns).set({ messages: history, updatedAt: new Date() }).where(eq(agentRuns.id, agentRunId));
          },
        })
      : requestChatCompletion(turns, signal, run.clerkUserId, undefined, undefined, preamble);
  try {
    await persist("run.started");
    let agentRunId = run.agentRunId ?? id;
    const leader = persona.mates.find((m) => m.id === persona.leaderId) ?? persona.mates[0]!;
    if (persona.kind !== "group") {
      await consume(await runMate(leader, agentRunId, personaPreamble(leader), request.messages, { resumeRunId: request.resumeRunId, choice: request.choice }));
    } else {
      const byId = new Map(persona.mates.map((m) => [m.id, m]));
      const textSince = (from: number) => content.slice(from).filter((p) => p.type === "text").map((p) => String(p.text)).join("\n").trim();
      let replies: { name: string; text: string }[] = [];
      let steps: { assignment: Assignment; runId: string; resume?: { resumeRunId?: string; choice?: string } }[];
      if (request.resumeRunId) {
        // A paused mate continues where it stopped, then the hand-offs queued behind it run.
        const [paused] = await getDb().select({ groupQueue: agentRuns.groupQueue }).from(agentRuns).where(eq(agentRuns.id, request.resumeRunId));
        const queue = paused?.groupQueue;
        replies = queue?.replies ?? [];
        steps = [
          { assignment: { mateId: queue?.mateId ?? leader.id, task: queue?.task ?? "" }, runId: request.resumeRunId, resume: { resumeRunId: request.resumeRunId, choice: request.choice } },
          ...(queue?.assignments ?? []).map((assignment) => ({ assignment, runId: randomUUID() })),
        ];
      } else if (missionInfo) {
        // A mission round: the leader hands work out, asks the user something key, or finishes.
        const [mission] = await getDb().select().from(missions).where(eq(missions.id, missionInfo.id));
        const step = mission?.status === "running" ? await planMissionRound({ mission, members: persona.mates, leaderId: leader.id, turns: request.messages }) : null;
        steps = [];
        if (step?.action === "checkin") {
          mergePayload(content, { cooper: { id: `speaker_${id}_lead`, state: speakerCard(leader) } });
          mergePayload(content, { choices: [{ delta: { content: step.question } }] });
          await getDb().update(missions).set({ status: "needs_input", question: step.question, updatedAt: new Date() }).where(eq(missions.id, missionInfo.id));
          const [chat] = run.chatId ? await getDb().select({ title: chats.title }).from(chats).where(eq(chats.id, run.chatId)) : [];
          await pushToUser(run.clerkUserId, { title: chat?.title ?? leader.name, body: `${leader.name}: ${step.question}`.slice(0, 200), data: { chatId: run.chatId } }).catch(() => false);
        } else if (step) {
          finishing = step.action === "finish";
          if (step.action === "assign" && step.handoff) {
            mergePayload(content, { cooper: { id: `speaker_${id}_lead`, state: speakerCard(leader) } });
            mergePayload(content, { choices: [{ delta: { content: step.handoff } }] });
          }
          await persist("progress");
          const assignments = step.action === "finish" ? [{ mateId: leader.id, task: step.task }] : step.assignments;
          steps = assignments.map((assignment, i) => ({ assignment, runId: i === 0 ? agentRunId : randomUUID() }));
        }
      } else {
        // Tagged mates answer in the order they were tagged; otherwise the leader hands off.
        const mentioned = parseMentions(request.messages.at(-1)?.content ?? "", persona.mates);
        const plan = mentioned.length
          ? { handoff: "", assignments: mentioned.map((mate) => ({ mateId: mate.id, task: "" })) }
          : await planGroupTurn({ members: persona.mates, leaderId: leader.id, turns: request.messages });
        if (plan.handoff) {
          mergePayload(content, { cooper: { id: `speaker_${id}_lead`, state: speakerCard(leader) } });
          mergePayload(content, { choices: [{ delta: { content: plan.handoff } }] });
          await persist("progress");
        }
        steps = plan.assignments.map((assignment, i) => ({ assignment, runId: i === 0 ? agentRunId : randomUUID() }));
      }
      const roundStart = new Date();
      let waitingOnUser = false;
      // The relay: who the leader handed to, in order, and each one's live status. A single mate
      // answering an ordinary message needs no card; missions always show it.
      const relay = steps.map((step) => ({ mate: byId.get(step.assignment.mateId) ?? leader, task: step.assignment.task, status: "queued" as HandoffStatus }));
      const showRelay = relay.length > 1 || (relay.length === 1 && (relay[0]!.mate.id !== leader.id || !!missionInfo));
      const relayId = `handoff_${id}`;
      const setRelay = async (i: number, status: HandoffStatus) => {
        if (!showRelay) return;
        relay[i]!.status = status;
        mergePayload(content, { cooper: { id: relayId, state: handoffCard(leader, relay, missionInfo?.round) } });
        await persist("progress");
      };
      if (showRelay) mergePayload(content, { cooper: { id: relayId, state: handoffCard(leader, relay, missionInfo?.round) } });
      for (const [i, step] of steps.entries()) {
        signal.throwIfAborted();
        const mate = byId.get(step.assignment.mateId) ?? leader;
        await setRelay(i, "working");
        agentRunId = step.runId;
        await getDb().update(delegations).set({ agentRunId }).where(eq(delegations.id, id));
        mergePayload(content, { cooper: { id: `speaker_${id}_${i}`, state: speakerCard(mate) } });
        const from = content.length;
        // Later mates build on what earlier mates said this turn.
        const turns = replies.length
          ? [...request.messages, { role: "assistant" as const, content: replies.map((r) => `${r.name}: ${r.text}`).join("\n\n").slice(0, 8_000) }]
          : request.messages;
        await consume(await runMate(mate, agentRunId, personaPreamble(mate, { members: persona.mates, task: step.assignment.task || undefined }), turns, step.resume));
        replies.push({ name: mate.name, text: textSince(from) });
        const [state] = await getDb().select({ status: agentRuns.status }).from(agentRuns).where(eq(agentRuns.id, agentRunId));
        await setRelay(i, state?.status.startsWith("waiting") ? "waiting" : failure || state?.status === "failed" ? "failed" : "done");
        if (state?.status.startsWith("waiting")) {
          waitingOnUser = true;
          // Waiting on the user (connect an app, sign in): keep the rest for when they resume.
          await getDb()
            .update(agentRuns)
            .set({ groupQueue: { mateId: mate.id, task: step.assignment.task, assignments: steps.slice(i + 1).map((s) => s.assignment), replies: replies.slice(0, -1) } })
            .where(eq(agentRuns.id, agentRunId));
          break;
        }
        if (failure) break;
      }
      if (missionInfo && steps.length && !failure && !waitingOnUser && !signal.aborted) {
        if (finishing) {
          await getDb().update(missions).set({ status: "done", summary: textSince(0).slice(0, 4_000), updatedAt: new Date() }).where(eq(missions.id, missionInfo.id));
        } else {
          // Progress means notes written; rounds that write nothing add up to a check-in, not a loop.
          const touched = await notesTouchedSince(missionInfo.id, roundStart);
          const [mission] = await getDb()
            .update(missions)
            .set({ idleRounds: touched ? 0 : sql`${missions.idleRounds} + 1`, updatedAt: new Date() })
            .where(eq(missions.id, missionInfo.id))
            .returning();
          if (mission && mission.idleRounds >= IDLE_ROUNDS_BEFORE_CHECKIN && mission.status === "running")
            await getDb()
              .update(missions)
              .set({ status: "needs_input", question: "The team hasn't made progress for a few rounds. What should we focus on next?", updatedAt: new Date() })
              .where(eq(missions.id, missionInfo.id));
        }
      }
    }
    const [agent] = await getDb().select().from(agentRuns).where(eq(agentRuns.id, agentRunId));
    status = signal.aborted ? userCancelled ? "cancelled" : "failed" : failure ? "failed" : agent?.status.startsWith("waiting") ? "waiting" : agent?.status === "failed" ? "failed" : "completed";
  } catch {
    status = userCancelled ? "cancelled" : "failed";
    failure = status === "cancelled" ? null : "This run was interrupted. Saved findings are available. Verify any external action before trying again.";
    if (!content.length) content.push({ type: "text", text: failure ?? "Stopped." });
  } finally {
    clearInterval(heartbeat);
    await persist(`run.${status}`, status);
    await getDb().update(delegations).set({ pendingTool: null }).where(eq(delegations.id, id));
    // Rounds post in the group as they go; only the finished mission becomes a Feed item.
    if (!missionInfo || finishing) await saveFinding(id);
    // A round's prompt is generated, so there is nothing of the user's to remember or index.
    if (status === "completed" && !missionInfo) await rememberFromRun(id, run, request.messages.at(-1), content, persist);
    if (run.chatId) await afterRunInChat(run.clerkUserId, run.chatId, !!missionInfo, status).catch(() => console.warn("mission_continue_failed", { id }));
  }
}

/**
 * After the reply is saved: index the exchange for chat-history recall, then let Cooper decide
 * what to keep as memories. Each change lands on the reply as a "Memory updated" card.
 */
async function rememberFromRun(
  id: string,
  run: { clerkUserId: string; chatId: string | null },
  last: { role: string; content: string; attachments?: unknown[] } | undefined,
  content: Content,
  persist: (type: string, finalStatus?: string) => Promise<void>,
) {
  if (last?.role !== "user") return;
  const assistantText = content.filter((p) => p.type === "text").map((p) => String(p.text)).join("\n");
  const settings = await memorySettings(run.clerkUserId).catch(() => null);
  if (!settings?.memoryEnabled) return;
  // Routine results are worth recalling later ("what did yesterday's brief say?").
  if (settings.historyRecall)
    await recordExchange({ delegationId: id, userId: run.clerkUserId, chatId: run.chatId, userText: last.content, assistantText }).catch(() => console.warn("recall_index_failed", { id }));
  // Routine prompts are generated, not said by the user, so there is nothing of theirs to keep.
  if (run.chatId?.startsWith("routine_")) return;
  // Explicit saves already happened in the turn; the extractor sees them and won't repeat them.
  try {
    const changes = await extractMemories({ userId: run.clerkUserId, chatId: run.chatId, userText: last.content, assistantText });
    if (!changes.length) return;
    for (const change of changes) mergePayload(content, { cooper: { id: `memory_${id}_${change.id}`, state: memoryCard(change) } });
    await persist("memory.updated", "completed");
  } catch {
    console.warn("memory_extraction_failed", { id });
  }
}

export async function saveFinding(id: string) {
  const [run] = await getDb().select().from(delegations).where(eq(delegations.id, id));
  if (!run || !terminalRun(run.status) || run.status === "cancelled") return;
  const request = run.request as { messages?: { content: string }[] };
  const title = request.messages?.at(-1)?.content.slice(0, 100) ?? "Mates result";
  const text = run.content.filter(p => p.type === "text").map(p => String(p.text)).join("\n").slice(0, 500);
  await getDb().insert(findings).values({ delegationId: id, clerkUserId: run.clerkUserId, title, summary: text || (run.status === "waiting" ? "Your attention is needed to continue." : run.error ?? "Your result is ready.") }).onConflictDoNothing();
}

export async function recoverStalledRuns() {
  const stale = await getDb().update(delegations).set({ status: "failed", error: "Execution was interrupted. Review saved findings and verify external actions before retrying.", updatedAt: new Date() }).where(and(eq(delegations.status, "running"), lte(delegations.heartbeatAt, new Date(Date.now() - 120_000)))).returning({ id: delegations.id });
  for (const run of stale) await saveFinding(run.id);
  // Expired queued submissions are surfaced instead of stuck indefinitely.
  const expired = await getDb().update(delegations).set({ status: "failed", error: "The worker did not start within one hour. Check worker deployment and submit again.", updatedAt: new Date() }).where(and(eq(delegations.status, "queued"), lte(delegations.createdAt, new Date(Date.now() - 3600_000)))).returning({ id: delegations.id });
  for (const run of expired) await saveFinding(run.id);
}

export async function listRuns(userId: string, chatId?: string) {
  return getDb().select({ id: delegations.id, chatId: delegations.chatId, status: delegations.status, agentRunId: delegations.agentRunId, updatedAt: delegations.updatedAt }).from(delegations).where(and(eq(delegations.clerkUserId, userId), ...(chatId ? [eq(delegations.chatId, chatId)] : []))).orderBy(desc(delegations.updatedAt)).limit(50);
}
