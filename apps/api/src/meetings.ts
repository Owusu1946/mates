import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { CALL_AGENT_NAME, callsConfigured, endCall, joinToken, signCallToken, type CallDispatch } from "./calls.js";
import { getDb } from "./db/client.js";
import { calls, mates, profiles, slackRuns, type MeetingInfo } from "./db/schema.js";
import { pushToUser } from "./delivery.js";
import { mateChatId } from "./mates.js";

/**
 * A mate in someone's meeting. Recall.ai sends a bot into the meeting under the mate's name; the bot's
 * camera is our page (apps/web /meet-bot), which joins the call's LiveKit room like the phone does:
 * it hands the voice agent the meeting's audio and plays the mate's voice back into the meeting,
 * while the mascot animates. The voice agent runs in meeting mode. Notes land like a call's.
 */

export const meetingsConfigured = () => callsConfigured() && !!process.env.RECALL_API_KEY;
const recallBase = () => `https://${process.env.RECALL_REGION ?? "us-west-2"}.recall.ai/api/v1`;
const SITE = () => process.env.SITE_URL ?? "https://agents.askorin.app";
const API = () => process.env.API_PUBLIC_URL ?? "https://mates-production.up.railway.app";
const PAGE_TOKEN_MS = 4 * 60 * 60_000;

/** Meeting links Recall's bot can join: Google Meet, Zoom and Microsoft Teams. */
const MEETING_LINK = [
  /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[?#].*)?$/i,
  /^https:\/\/([\w-]+\.)?zoom\.us\/(j|my|w)\/[\w./?=&-]+$/i,
  /^https:\/\/teams\.(microsoft|live)\.com\/[\w./?=&%:@-]+$/i,
];
export const isMeetingLink = (url: string) => MEETING_LINK.some((pattern) => pattern.test(url.trim()));
/** The first meeting link in some text (a chat message, a Slack ask). */
export const findMeetingLink = (text: string) => text.match(/https:\/\/[^\s<>|)"']+/g)?.map((url) => url.replace(/[.,]+$/, "")).find(isMeetingLink) ?? null;

export class MeetingError extends Error {
  constructor(readonly code: "NOT_CONFIGURED" | "INVALID_LINK" | "NOT_FOUND" | "RECALL_FAILED", message: string) {
    super(message);
  }
}

// ---- The page's token: lets the bot's page start and leave this one meeting, nothing else ------

const pageKey = () => createHmac("sha256", process.env.CALL_TOKEN_SECRET ?? process.env.CLERK_SECRET_KEY ?? "").update("mates-meeting-page").digest();

export function signPageToken(callId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ c: callId, e: now + PAGE_TOKEN_MS })).toString("base64url");
  return `${payload}.${createHmac("sha256", pageKey()).update(payload).digest("base64url")}`;
}

export function verifyPageToken(token: string | undefined, callId: string, now = Date.now()) {
  const [payload, signature] = (token ?? "").split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", pageKey()).update(payload).digest("base64url"));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { c?: string; e?: number };
    return claims.c === callId && typeof claims.e === "number" && claims.e > now;
  } catch {
    return false;
  }
}

// ---- Recall --------------------------------------------------------------------------------

async function recall<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${recallBase()}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Token ${process.env.RECALL_API_KEY}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) throw new MeetingError("RECALL_FAILED", `Recall answered ${response.status}: ${JSON.stringify(value).slice(0, 300)}`);
  return value;
}

/** What we ask Recall for: the mate's name, our page as its camera, and a hello in the chat. */
export function botRequest(input: { meetingUrl: string; mateName: string; ownerName?: string; pageUrl: string; callId: string }) {
  const owner = input.ownerName ? `${input.ownerName}’s` : "an";
  return {
    meeting_url: input.meetingUrl,
    bot_name: `${input.mateName} (Mates)`.slice(0, 100),
    metadata: { callId: input.callId },
    output_media: { camera: { kind: "webpage", config: { url: input.pageUrl } } },
    // Four cores keep the animated camera smooth (Recall's advice for Output Media).
    variant: { google_meet: "web_4_core", zoom: "web_4_core", microsoft_teams: "web_4_core" },
    automatic_leave: { waiting_room_timeout: 600, noone_joined_timeout: 600, everyone_left_timeout: { timeout: 30 } },
    // Everyone is told who joined and why, the moment it arrives.
    chat: { on_bot_join: { send_to: "everyone", message: `Hi, I’m ${input.mateName}, ${owner} AI mate from Mates. I’m taking notes, and I’ll answer if you say my name.`.slice(0, 500) } },
  };
}

const firstName = (name?: string | null) => (name && !name.includes("@") ? name.trim().split(/\s+/)[0] : undefined);

export const startMeetingSchema = z.object({ meetingUrl: z.string().url().max(2000), mateId: z.string().uuid(), timezone: z.string().max(64).optional() });

/**
 * Sends the user's mate into a meeting. Returns at once; the knock, the meeting and the notes follow
 * through Recall's webhooks and the voice agent. `slack` is where to post the notes too.
 */
export async function startMeeting(userId: string, input: z.infer<typeof startMeetingSchema> & { slack?: MeetingInfo["slack"] }) {
  if (!meetingsConfigured()) throw new MeetingError("NOT_CONFIGURED", "Meetings aren’t set up on this server yet.");
  const meetingUrl = input.meetingUrl.trim();
  if (!isMeetingLink(meetingUrl)) throw new MeetingError("INVALID_LINK", "That isn’t a Google Meet, Zoom or Teams link.");
  const [mate] = await getDb().select().from(mates).where(and(eq(mates.id, input.mateId), eq(mates.clerkUserId, userId)));
  if (!mate) throw new MeetingError("NOT_FOUND", "That mate isn’t yours.");
  const [profile] = await getDb().select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.clerkUserId, userId));
  const userName = firstName(profile?.displayName);

  const id = randomUUID();
  const meeting: MeetingInfo = { url: meetingUrl, botStatus: "starting", userName, timezone: input.timezone, ...(input.slack ? { slack: input.slack } : {}) };
  await getDb().insert(calls).values({ id, clerkUserId: userId, chatId: mateChatId(mate.id), leadMateId: mate.id, mateIds: [mate.id], roomName: `meet_${id}`, kind: "meeting", meeting });

  const pageUrl = `${SITE()}/meet-bot?${new URLSearchParams({ m: id, t: signPageToken(id), api: API() })}`;
  try {
    const bot = await recall<{ id: string }>("/bot/", botRequest({ meetingUrl, mateName: mate.name, ownerName: userName, pageUrl, callId: id }));
    await getDb().update(calls).set({ meeting: { ...meeting, botId: bot.id, botStatus: "joining" } }).where(eq(calls.id, id));
  } catch (error) {
    await getDb().update(calls).set({ status: "failed", meeting: { ...meeting, botStatus: "failed" } }).where(eq(calls.id, id));
    console.warn("meeting_start_failed", { callId: id, message: error instanceof Error ? error.message : String(error) });
    throw error instanceof MeetingError ? error : new MeetingError("RECALL_FAILED", "Couldn’t send your mate to the meeting.");
  }
  return { callId: id, mate: mate.name };
}

async function meetingCall(callId: string) {
  if (!z.string().uuid().safeParse(callId).success) return null;
  const [call] = await getDb().select().from(calls).where(and(eq(calls.id, callId), eq(calls.kind, "meeting")));
  return call ?? null;
}

/**
 * What the bot's page needs to join: the LiveKit room and a fresh token that dispatches the voice
 * agent in meeting mode, plus how to draw the mate. Asked for when the page loads, so the token is
 * never older than the join (the bot may wait minutes in a waiting room first).
 */
export async function meetingSession(callId: string, pageToken: string | undefined) {
  if (!verifyPageToken(pageToken, callId)) return null;
  const call = await meetingCall(callId);
  if (!call || call.status === "ended" || call.status === "failed") return null;
  const [mate] = call.leadMateId ? await getDb().select().from(mates).where(eq(mates.id, call.leadMateId)) : [];
  if (!mate) return null;
  const dispatch: CallDispatch = { callId: call.id, callToken: signCallToken(call.id, call.clerkUserId), userName: call.meeting?.userName, timezone: call.meeting?.timezone, mode: "meeting" };
  const token = await joinToken(call.clerkUserId, call.roomName, dispatch, { identity: `meet_${call.id}`, name: "Meeting" });
  return { serverUrl: process.env.LIVEKIT_URL!, token, agentName: CALL_AGENT_NAME, mate: { name: mate.name, color: mate.color, shape: mate.shape } };
}

/** The mate was asked to leave (by name in the meeting, or by its owner): Recall takes the bot out. */
export async function leaveMeeting(callId: string, pageToken?: string, ownerId?: string) {
  const call = await meetingCall(callId);
  if (!call || (ownerId ? call.clerkUserId !== ownerId : !verifyPageToken(pageToken, callId))) return false;
  if (call.meeting?.botId) await recall(`/bot/${call.meeting.botId}/leave_call/`).catch((error) => console.warn("meeting_leave_failed", { callId, message: error instanceof Error ? error.message : String(error) }));
  return true;
}

/** The meeting the user's run was asked from in Slack, so its notes go back to that thread. */
export async function slackOrigin(runId: string | undefined) {
  if (!runId || !z.string().uuid().safeParse(runId).success) return undefined;
  const [row] = await getDb().select().from(slackRuns).where(eq(slackRuns.delegationId, runId));
  return row ? { teamId: row.teamId, channelId: row.channelId, threadTs: row.threadTs } : undefined;
}

// ---- Recall's webhooks -----------------------------------------------------------------------

/**
 * Whether a webhook really came from Recall: HMAC-SHA256 of `{id}.{timestamp}.{body}` keyed by the
 * workspace secret (`whsec_` + base64), base64-encoded, matching one `v1,` entry; no older than five
 * minutes. Recall sends `webhook-*` headers (or `svix-*` on older workspaces).
 */
export function verifyRecallWebhook(raw: string, headers: (name: string) => string | undefined, secret = process.env.RECALL_WEBHOOK_SECRET ?? "", now = Date.now()) {
  const id = headers("webhook-id") ?? headers("svix-id");
  const timestamp = headers("webhook-timestamp") ?? headers("svix-timestamp");
  const signatures = headers("webhook-signature") ?? headers("svix-signature");
  if (!secret.startsWith("whsec_") || !id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${timestamp}.${raw}`).digest("base64"));
  return signatures.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

type RecallEvent = { event?: string; data?: { data?: { code?: string; sub_code?: string | null }; bot?: { id?: string; metadata?: Record<string, string> } } };

/** How long to wait for the voice agent's own transcript before closing a meeting without it. */
const AGENT_GRACE_MS = 90_000;

/** A bot status change from Recall: keep the user posted, and make sure every meeting gets its notes. */
export async function handleRecallEvent(body: RecallEvent) {
  const callId = body.data?.bot?.metadata?.callId;
  const event = body.event ?? "";
  if (!callId || !event.startsWith("bot.")) return;
  const call = await meetingCall(callId);
  if (!call || call.meeting?.botId !== body.data?.bot?.id) return;
  const status = event.slice(4);
  await getDb().update(calls).set({ meeting: { ...call.meeting!, botStatus: status } }).where(eq(calls.id, call.id));
  const [mate] = call.leadMateId ? await getDb().select({ name: mates.name }).from(mates).where(eq(mates.id, call.leadMateId)) : [];
  const name = mate?.name ?? "Your mate";
  const data = { chatId: call.chatId, chatKind: "mate" };

  if (status === "in_waiting_room") {
    await pushToUser(call.clerkUserId, { title: `${name} is at the door`, body: `Admit “${name} (Mates)” in the meeting to let them in.`, data });
  } else if (status === "fatal") {
    if (call.status !== "ended") await getDb().update(calls).set({ status: "failed" }).where(eq(calls.id, call.id));
    const why = body.data?.data?.sub_code?.replace(/_/g, " ") ?? "something went wrong";
    await pushToUser(call.clerkUserId, { title: `${name} couldn’t join`, body: `The meeting didn’t let ${name} in (${why}).`, data });
  } else if (status === "done" || status === "call_ended") {
    // The voice agent normally ends the call with the transcript; if it never got the chance (the
    // page didn't connect), close it without one so the meeting still gets its card.
    setTimeout(async () => {
      const latest = await meetingCall(call.id).catch(() => null);
      if (!latest || latest.status === "ended" || (latest.status === "failed" && latest.meeting?.botStatus === "fatal")) return;
      await endCall(call.clerkUserId, call.id, { durationSec: 0, transcript: [] }).catch(() => undefined);
    }, AGENT_GRACE_MS).unref();
  }
}

// ---- The mates' tool: "join my meeting <link>" from the app, Slack or a call --------------------

export const joinMeetingTool = {
  type: "function" as const,
  function: {
    name: "cooper_join_meeting",
    description:
      "Join a Google Meet, Zoom or Teams meeting yourself, as this mate: you appear with your own name and face, take notes, answer when someone says your name, and post the notes here afterwards. Use when the user shares a meeting link and asks you to join, sit in or take notes. Someone in the meeting must admit you.",
    parameters: {
      type: "object",
      properties: { meeting_url: { type: "string", description: "The meeting link, exactly as shared (https://meet.google.com/..., zoom.us/j/..., teams link)." } },
      required: ["meeting_url"],
      additionalProperties: false,
    },
  },
};

/** Runs the tool for the speaking mate; the answer tells the model what to say next. */
export async function runJoinMeeting(userId: string, mateId: string | undefined, args: Record<string, unknown>, context: { timezone?: string; runId?: string }) {
  // The link as the model passed it, or the meeting link inside it (Slack markup, a sentence around it).
  const raw = typeof args.meeting_url === "string" ? args.meeting_url : "";
  const meetingUrl = findMeetingLink(raw) ?? raw;
  if (!mateId) return { error: "Only a mate can join a meeting." };
  try {
    const started = await startMeeting(userId, { meetingUrl, mateId, timezone: context.timezone, slack: await slackOrigin(context.runId) });
    return { joining: true, callId: started.callId, next: `Tell the user in one short sentence that you're on your way, and to admit "${started.mate} (Mates)" when you knock. The notes will land in this chat when the meeting ends.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn’t join that meeting." };
  }
}
