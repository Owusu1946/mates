import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";
import { z } from "zod";
import { createChatStore } from "./chats.js";
import { getDb } from "./db/client.js";
import { calls, chatMessages, chats, mates, recallEntries } from "./db/schema.js";
import { submitRun } from "./durable-runs.js";
import { embedOne } from "./embeddings.js";
import type { WorkflowCard } from "./integrations.js";
import { gradientOf, ROLE_PRESETS, type MateRole } from "./mates.js";
import { extractMemories, listMemories, memorySettings } from "./memory.js";
import { recentTurns } from "./missions.js";
import { CHAT_MODEL } from "./models.js";
import { keytermsFor } from "./transcription.js";
import { pushToUser } from "./delivery.js";
import { installFor, mateIdentity, slackApi } from "./slack.js";
import { meterOpenRouter, type MeterContext, type OpenRouterUsage } from "./usage/openrouter.js";
import { perMinute, price } from "./usage/prices.js";
import { recordUsage } from "./usage/record.js";
import { assertUsage, usageCapMs } from "./usage/gate.js";

/**
 * Voice calls with mates. The API creates the call and signs the phone's LiveKit token, which
 * dispatches the voice agent with a per-call token. The agent uses that token to read the call's
 * context, hand work off to the chat and report the transcript; it never holds server secrets.
 */

export const CALL_AGENT_NAME = process.env.LIVEKIT_AGENT_NAME ?? "mates-voice";
/** The lead and up to three others: past that, a call stops feeling like a conversation. */
export const MAX_CALL_MATES = 4;
const JOIN_TTL = "15m";
const CALL_TOKEN_MS = 3 * 60 * 60_000;
const TRANSCRIPT_LINES = 400;

export const callsConfigured = () => !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);

export class CallError extends Error {
  constructor(readonly code: "NOT_FOUND" | "INVALID_MATES" | "ENDED") {
    super(code);
  }
}

/**
 * Inworld TTS-2 voices for mates, alternating feminine and masculine so neighbours on a call
 * sound distinct. A mate keeps the same voice on every call.
 */
export const VOICES = ["Ashley", "Dennis", "Sarah", "Shaun", "Olivia", "Arthur", "Zoe", "Clive", "Amara", "Alex"] as const;

/** Each mate's voice: stable per mate, and never shared by two mates on the same call. */
export function voicesFor(mateIds: string[]): Map<string, (typeof VOICES)[number]> {
  const taken = new Set<number>();
  const result = new Map<string, (typeof VOICES)[number]>();
  for (const id of mateIds) {
    let index = createHmac("sha256", "mates-voice").update(id).digest().readUInt32BE(0) % VOICES.length;
    while (taken.has(index) && taken.size < VOICES.length) index = (index + 1) % VOICES.length;
    taken.add(index);
    result.set(id, VOICES[index]!);
  }
  return result;
}

// ---- The agent's per-call token -------------------------------------------------------------

const tokenKey = () => createHmac("sha256", process.env.CALL_TOKEN_SECRET ?? process.env.CLERK_SECRET_KEY ?? "").update("mates-call-token").digest();

export function signCallToken(callId: string, userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ c: callId, u: userId, e: now + CALL_TOKEN_MS })).toString("base64url");
  return `${payload}.${createHmac("sha256", tokenKey()).update(payload).digest("base64url")}`;
}

/** The call's owner when the token is genuine, unexpired and for this call; otherwise null. */
export function verifyCallToken(token: string | undefined, callId: string, now = Date.now()): string | null {
  const [payload, signature] = (token ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(createHmac("sha256", tokenKey()).update(payload).digest("base64url"));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { c?: string; u?: string; e?: number };
    return claims.c === callId && typeof claims.u === "string" && typeof claims.e === "number" && claims.e > now ? claims.u : null;
  } catch {
    return null;
  }
}

// ---- Starting a call ------------------------------------------------------------------------

export const startCallSchema = z.object({
  chatId: z.string().min(1).max(200),
  leadMateId: z.string().uuid(),
  mateIds: z.array(z.string().uuid()).max(MAX_CALL_MATES - 1).default([]),
  userName: z.string().trim().max(80).optional(),
  timezone: z.string().max(64).optional(),
});

/** What the voice agent receives when it's dispatched to the call's room. `mode` "meeting": a mate in someone's meeting. */
/** `maxMs`: when set, the call ends then because the person's usage runs out (see usageCapMs). */
export type CallDispatch = { callId: string; callToken: string; userName?: string; timezone?: string; mode?: "call" | "meeting"; maxMs?: number };
export const MAX_CALL_MS = 30 * 60_000;
export const MAX_MEETING_MS = 2 * 60 * 60_000;

export async function startCall(userId: string, input: z.infer<typeof startCallSchema>) {
  await assertUsage(userId, "calls");
  if (!(await createChatStore().get(userId, input.chatId))) throw new CallError("NOT_FOUND");
  const wanted = [...new Set([input.leadMateId, ...input.mateIds])].slice(0, MAX_CALL_MATES);
  const owned = await getDb().select({ id: mates.id }).from(mates).where(and(eq(mates.clerkUserId, userId), inArray(mates.id, wanted)));
  if (owned.length !== wanted.length) throw new CallError("INVALID_MATES");

  const id = randomUUID();
  const roomName = `call_${id}`;
  await getDb().insert(calls).values({ id, clerkUserId: userId, chatId: input.chatId, leadMateId: input.leadMateId, mateIds: wanted, roomName });

  const dispatch: CallDispatch = { callId: id, callToken: signCallToken(id, userId), userName: input.userName, timezone: input.timezone, maxMs: await usageCapMs(userId, price("CALL_MINUTE"), MAX_CALL_MS) };
  return { callId: id, roomName, serverUrl: process.env.LIVEKIT_URL!, token: await joinToken(userId, roomName, dispatch) };
}

/**
 * The phone's LiveKit token: join and talk in this call's room only, and dispatch the voice agent
 * with the call's details. Each call has its own room, so the dispatch always applies (LiveKit
 * only applies a token's dispatch when the room is created).
 */
export async function joinToken(userId: string, roomName: string, dispatch: CallDispatch, who: { identity: string; name: string } = { identity: `user_${userId}`, name: dispatch.userName ?? "You" }) {
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity: who.identity, name: who.name, ttl: JOIN_TTL });
  token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
  token.roomConfig = new RoomConfiguration({ agents: [new RoomAgentDispatch({ agentName: CALL_AGENT_NAME, metadata: JSON.stringify(dispatch) })] });
  return token.toJwt();
}

async function ownedCall(userId: string, callId: string) {
  if (!z.string().uuid().safeParse(callId).success) throw new CallError("NOT_FOUND");
  const [call] = await getDb().select().from(calls).where(and(eq(calls.id, callId), eq(calls.clerkUserId, userId)));
  if (!call) throw new CallError("NOT_FOUND");
  return call;
}

// ---- What the agent needs -------------------------------------------------------------------

export type CallMate = { id: string; name: string; brief: string; voice: string; color: string; shape: string; gradient: [string, string, string] };

/** The user's mates in the order given, with personas and voices. Order matters: earlier mates keep their voices. */
async function rosterFor(userId: string, mateIds: string[]): Promise<CallMate[]> {
  const rows = mateIds.length ? await getDb().select().from(mates).where(and(eq(mates.clerkUserId, userId), inArray(mates.id, mateIds))) : [];
  const byId = new Map(rows.map((m) => [m.id, m]));
  const ordered = mateIds.map((id) => byId.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
  const voices = voicesFor(ordered.map((m) => m.id));
  return ordered.map((m) => ({
    id: m.id,
    name: m.name,
    brief: m.roleDescription.trim() || ROLE_PRESETS[(m.role as MateRole) in ROLE_PRESETS ? (m.role as MateRole) : "companion"].brief,
    voice: voices.get(m.id)!,
    color: m.color,
    shape: m.shape,
    gradient: gradientOf(m.color),
  }));
}

/** The mates on the call (lead first), with personas and voices; marks the call live. */
export async function callContext(userId: string, callId: string) {
  const call = await ownedCall(userId, callId);
  if (call.status === "ended") throw new CallError("ENDED");
  const roster = await rosterFor(userId, call.mateIds);
  const [chat] = await getDb().select({ kind: chats.kind, title: chats.title }).from(chats).where(eq(chats.id, call.chatId));
  const settings = await memorySettings(userId).catch(() => null);
  const memoryRows = settings?.memoryEnabled ? await listMemories(userId).catch(() => []) : [];
  const remembered = [...memoryRows].sort((a, b) => b.importance - a.importance).slice(0, 15).map((m) => m.text);
  const recent = (await recentTurns(call.chatId, 10).catch(() => [])).map((t) => ({ role: t.role, content: t.content.slice(0, 600) }));
  if (call.status === "ringing") await getDb().update(calls).set({ status: "live", startedAt: new Date() }).where(eq(calls.id, call.id));
  return {
    callId: call.id,
    kind: call.kind,
    leadMateId: call.leadMateId ?? roster[0]?.id ?? null,
    chatKind: chat?.kind ?? "mate",
    chatTitle: chat?.title ?? "",
    mates: roster,
    memories: remembered,
    recent,
    keyterms: keytermsFor(roster.map((m) => m.name)),
  };
}

/** Everyone who joins over a call's life, so each keeps a distinct voice (there are ten). */
const MAX_JOINED_MATES = 8;

export const inviteMateSchema = z.object({ mateId: z.string().uuid() });

/**
 * A mate the user brings in mid-call. `mateIds` records everyone who joined (the card lists them
 * and they can take tasks); who is on the call right now is the agent's to track. Mates already
 * joined keep their voices because the newcomer is appended. Returns the whole roster.
 */
export async function inviteCallMate(userId: string, callId: string, input: z.infer<typeof inviteMateSchema>) {
  const call = await ownedCall(userId, callId);
  if (call.status === "ended") throw new CallError("ENDED");
  const joined = call.mateIds.includes(input.mateId) ? call.mateIds : [...call.mateIds, input.mateId];
  if (joined.length > MAX_JOINED_MATES) throw new CallError("INVALID_MATES");
  const roster = await rosterFor(userId, joined);
  if (roster.length !== joined.length) throw new CallError("INVALID_MATES");
  if (joined !== call.mateIds) await getDb().update(calls).set({ mateIds: joined }).where(eq(calls.id, call.id));
  return { mates: roster };
}

// ---- Handing work off to the chat -----------------------------------------------------------

export const callTaskSchema = z.object({ mateId: z.string().uuid(), task: z.string().trim().min(3).max(2_000) });

/** Starts a background run in the call's chat for one mate on the call; returns the run id. */
export async function startCallTask(userId: string, callId: string, input: z.infer<typeof callTaskSchema>) {
  const call = await ownedCall(userId, callId);
  if (!call.mateIds.includes(input.mateId)) throw new CallError("INVALID_MATES");
  const [mate] = await getDb().select({ name: mates.name }).from(mates).where(eq(mates.id, input.mateId));
  const [chat] = await getDb().select({ kind: chats.kind }).from(chats).where(eq(chats.id, call.chatId));
  // In a group, the mention routes the task to the mate who took it on the call.
  const text = `${chat?.kind === "group" && mate ? `@${mate.name} ` : ""}${input.task} (from our call)`;
  const key = randomUUID();
  const parentId = `user_call_${key}`;
  const [head] = await getDb().select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.chatId, call.chatId)).orderBy(desc(chatMessages.createdAt)).limit(1);
  await getDb()
    .insert(chatMessages)
    .values({ chatId: call.chatId, id: parentId, parentId: head?.id ?? null, message: { id: parentId, role: "user", createdAt: new Date().toISOString(), content: [{ type: "text", text }] } })
    .onConflictDoNothing();
  const run = await submitRun(userId, { chatId: call.chatId, parentId, assistantMessageId: `assistant_call_${key}`, requestKey: `call_${callId}_${key}`, messages: [{ role: "user", content: text }] });
  return { runId: run.id };
}

// ---- Ending: transcript, summary, card, memory ----------------------------------------------

export const endCallSchema = z.object({
  durationSec: z.number().int().min(0).max(24 * 3600),
  // Sized to stay under the API's 1 MB request limit; the agent sends the latest lines.
  transcript: z.array(z.object({ speaker: z.string().max(80), text: z.string().max(1_500), at: z.string().max(40) })).max(TRANSCRIPT_LINES).default([]),
});

export type CallCard = NonNullable<WorkflowCard["call"]>;

/** A short, plain-words summary and the action items, from the transcript. Never throws. */
export async function summarise(transcript: { speaker: string; text: string }[], minutes: number, kind: "call" | "meeting" = "call", meter?: MeterContext): Promise<{ summary: string; actionItems: string[] }> {
  const fallback = {
    summary: transcript.length ? `${kind === "meeting" ? "The meeting ran" : "We talked"} for ${Math.max(1, minutes)} minute${minutes === 1 ? "" : "s"}.` : kind === "meeting" ? "No one spoke while I was in the meeting." : "The call ended before anyone spoke.",
    actionItems: [],
  };
  if (!transcript.length || !process.env.OPENROUTER_API_KEY) return fallback;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 600,
        usage: { include: true },
        reasoning: { effort: "low" },
        messages: [
          {
            role: "system",
            content:
              kind === "meeting"
                ? "These are notes from a meeting the user's AI mate sat in on. 'Meeting' lines are the people in it (several voices mixed together); other speakers are the mate. summary: 2-4 short sentences in plain words: what it was about and what was decided. action_items: concrete things someone agreed to do, each short, with who if it was said; empty if none. Don't invent anything that wasn't said."
                : "Summarise this voice call between the user and their AI mates for the chat history. summary: 1-3 short sentences in plain words, written to the user (\"we\"). action_items: concrete things someone agreed to do, each short; empty if none. Don't invent anything that wasn't said.",
          },
          { role: "user", content: transcript.map((l) => `${l.speaker}: ${l.text}`).join("\n").slice(-24_000) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "call_summary", strict: true, schema: { type: "object", properties: { summary: { type: "string" }, action_items: { type: "array", items: { type: "string" } } }, required: ["summary", "action_items"], additionalProperties: false } },
        },
      }),
    });
    if (!response.ok) return fallback;
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[]; usage?: OpenRouterUsage };
    if (meter) void meterOpenRouter(meter, CHAT_MODEL, body.usage);
    const parsed = z.object({ summary: z.string(), action_items: z.array(z.string()) }).parse(JSON.parse(body.choices?.[0]?.message?.content ?? "null"));
    return { summary: parsed.summary.trim().slice(0, 1_000) || fallback.summary, actionItems: parsed.action_items.map((a) => a.trim().slice(0, 200)).filter(Boolean).slice(0, 8) };
  } catch {
    return fallback;
  }
}

/**
 * Closes the call once: saves the transcript and summary, posts the call card in the chat, and
 * lets the mates remember it (recall plus memory extraction). Later calls return the same result.
 */
export async function endCall(userId: string, callId: string, input: z.infer<typeof endCallSchema>) {
  const call = await ownedCall(userId, callId);
  if (call.status === "ended") return { summary: call.summary, actionItems: call.actionItems ?? [] };
  const transcript = input.transcript.map((l) => ({ ...l, text: l.text.trim() })).filter((l) => l.text).slice(-TRANSCRIPT_LINES);
  const durationSec = input.durationSec || (call.startedAt ? Math.round((Date.now() - call.startedAt.getTime()) / 1000) : 0);
  // Claim the close first, so a second end (agent and app both report) doesn't post two cards.
  const [claimed] = await getDb()
    .update(calls)
    .set({ status: "ended", endedAt: new Date(), durationSec, transcript })
    .where(and(eq(calls.id, call.id), inArray(calls.status, ["ringing", "live", "failed"])))
    .returning();
  if (!claimed) return { summary: call.summary, actionItems: call.actionItems ?? [] };
  const meeting = claimed.kind === "meeting";
  void recordUsage({ userId, source: meeting ? "meeting" : "call", provider: meeting ? "recall" : "livekit", ref: claimed.id, seconds: durationSec, costMicros: perMinute(meeting ? "MEETING_MINUTE" : "CALL_MINUTE", durationSec), estimated: true, key: `call:${claimed.id}` });
  // The agent reports from a shutdown hook with ~10 seconds to spare: the transcript is saved now,
  // and the summary, card and memories follow without making it wait.
  void finishCall(userId, claimed, transcript, durationSec).catch(() => console.warn("call_finish_failed", { callId: call.id }));
  return { accepted: true };
}

async function finishCall(userId: string, call: typeof calls.$inferSelect, transcript: { speaker: string; text: string; at: string }[], durationSec: number) {
  const meeting = call.kind === "meeting";
  const { summary, actionItems } = await summarise(transcript, Math.round(durationSec / 60), call.kind, { userId, source: meeting ? "meeting" : "call", ref: call.id });
  await getDb().update(calls).set({ summary, actionItems }).where(eq(calls.id, call.id));

  const rows = await getDb().select().from(mates).where(inArray(mates.id, call.mateIds.length ? call.mateIds : [randomUUID()]));
  const card: WorkflowCard = {
    kind: "call",
    phase: "done",
    label: meeting ? "Meeting" : "Call",
    call: { callId: call.id, durationSec, summary, actionItems, mates: rows.map((m) => ({ id: m.id, name: m.name, color: m.color, shape: m.shape, gradient: gradientOf(m.color) })), lines: transcript.length },
  };
  const messageId = `call_${call.id}`;
  const [head] = await getDb().select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.chatId, call.chatId)).orderBy(desc(chatMessages.createdAt)).limit(1);
  await getDb()
    .insert(chatMessages)
    .values({
      chatId: call.chatId,
      id: messageId,
      parentId: head?.id ?? null,
      message: { id: messageId, role: "assistant", createdAt: new Date().toISOString(), content: [{ type: "tool-call", toolCallId: messageId, toolName: "cooper_workflow", args: {}, argsText: "{}", result: card }], status: { type: "complete", reason: "stop" }, metadata: { custom: { callId: call.id } } },
    })
    .onConflictDoNothing();
  await getDb().update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, call.chatId));
  if (meeting) await shareMeetingNotes(userId, call, rows[0]?.name ?? "Your mate", summary, actionItems).catch(() => console.warn("meeting_notes_share_failed", { callId: call.id }));

  // In a meeting, everyone else's words come in as "Meeting"; the owner is among them.
  const userText = transcript.filter((l) => l.speaker === (meeting ? "Meeting" : "You")).map((l) => l.text).join("\n");
  const mateText = transcript.filter((l) => l.speaker !== "You").map((l) => `${l.speaker}: ${l.text}`).join("\n");
  await rememberCall(userId, call.chatId, summary, userText, mateText, call.kind).catch(() => console.warn("call_memory_failed", { callId: call.id }));
}

/** A meeting's notes reach the owner wherever they are: a push, and the Slack thread it was asked from. */
async function shareMeetingNotes(userId: string, call: typeof calls.$inferSelect, mateName: string, summary: string, actionItems: string[]) {
  await pushToUser(userId, { title: `${mateName}’s meeting notes`, body: summary.slice(0, 180), data: { chatId: call.chatId, chatKind: "mate" } });
  const slack = call.meeting?.slack;
  const install = slack ? await installFor(slack.teamId) : null;
  if (!slack || !install) return;
  const [mate] = call.leadMateId ? await getDb().select().from(mates).where(eq(mates.id, call.leadMateId)) : [];
  const items = actionItems.length ? `\n*Action items*\n${actionItems.map((item) => `• ${item}`).join("\n")}` : "";
  await slackApi(install.token, "chat.postMessage", { channel: slack.channelId, thread_ts: slack.threadTs, ...(mate ? mateIdentity(mate) : {}), text: `*Meeting notes*\n${summary}${items}`.slice(0, 3900) });
}

async function rememberCall(userId: string, chatId: string, summary: string, userText: string, mateText: string, kind: "call" | "meeting") {
  const content = `${kind === "meeting" ? "Meeting" : "Voice call"} on ${new Date().toISOString().slice(0, 10)}. ${summary}\nUser said: ${userText.slice(0, 1_500)}`;
  await getDb().insert(recallEntries).values({ clerkUserId: userId, chatId, kind: "exchange", content, embedding: await embedOne(content) });
  await extractMemories({ userId, chatId, userText: userText.slice(0, 6_000), assistantText: mateText.slice(0, 6_000) });
}

/** The call for the app's transcript sheet. */
export async function getCall(userId: string, callId: string) {
  const call = await ownedCall(userId, callId);
  return { id: call.id, status: call.status, durationSec: call.durationSec, summary: call.summary, actionItems: call.actionItems ?? [], transcript: call.transcript ?? [], startedAt: call.startedAt, endedAt: call.endedAt };
}
