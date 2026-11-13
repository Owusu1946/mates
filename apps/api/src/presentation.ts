import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, ilike, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { calls, decks, type MeetingInfo } from "./db/schema.js";
import { meetingById, pageTokenMatches, sharePageUrl, startScreenshare, stopScreenshare } from "./meetings.js";

/**
 * A mate presenting a deck in a meeting. The bot shares a page of ours as its screen (`/meet-share`)
 * that shows the current slide; the mate narrates from the speaker notes and moves through the
 * slides with the agent routes here. When the meeting won't let the bot share, the slides show on
 * its tile instead (`mode: "tile"`). State lives on the meeting (`calls.meeting.presentation`), so
 * the pages only have to read it.
 */

export type Presentation = NonNullable<MeetingInfo["presentation"]>;

export class PresentError extends Error {
  constructor(readonly code: "NOT_LIVE" | "NOT_FOUND" | "UNFINISHED", message: string) {
    super(message);
  }
}

// ---- The share page's token: reads this meeting's presentation, nothing else ------------------

const SHARE_MS = 4 * 60 * 60_000;
const shareKey = () => createHmac("sha256", process.env.CALL_TOKEN_SECRET ?? process.env.CLERK_SECRET_KEY ?? "").update("mates-share-token").digest();

export function signShareToken(callId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ c: callId, e: now + SHARE_MS })).toString("base64url");
  return `${payload}.${createHmac("sha256", shareKey()).update(payload).digest("base64url")}`;
}

export function verifyShareToken(token: string | undefined, callId: string, now = Date.now()) {
  const [payload, signature] = (token ?? "").split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", shareKey()).update(payload).digest("base64url"));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { c?: string; e?: number };
    return claims.c === callId && typeof claims.e === "number" && claims.e > now;
  } catch {
    return false;
  }
}

// ---- What the mate can do ---------------------------------------------------------------------

const ENDED = ["ended", "failed"];
const BUILDING = ["queued", "outlining", "writing"];

async function liveMeeting(userId: string, callId: string) {
  if (!z.string().uuid().safeParse(callId).success) throw new PresentError("NOT_LIVE", "This meeting has ended.");
  const [call] = await getDb().select().from(calls).where(and(eq(calls.id, callId), eq(calls.clerkUserId, userId), eq(calls.kind, "meeting")));
  if (!call || ENDED.includes(call.status)) throw new PresentError("NOT_LIVE", "This meeting has ended.");
  return call;
}

/** One field of the meeting at a time, so Recall's status updates and this never undo each other. */
const savePresentation = (callId: string, value: Presentation | null) =>
  getDb().update(calls).set({ meeting: sql`jsonb_set(coalesce(${calls.meeting}, '{}'::jsonb), '{presentation}', ${JSON.stringify(value)}::jsonb)` }).where(eq(calls.id, callId));

/** The owner's decks a mate might present: this chat's newest first, optionally matching a name. */
export async function findDecks(userId: string, callId: string, query?: string) {
  const call = await liveMeeting(userId, callId);
  const name = query?.trim().slice(0, 80);
  const rows = await getDb()
    .select({ id: decks.id, title: decks.title, status: decks.status, built: decks.built, total: decks.total, chatId: decks.chatId })
    .from(decks)
    .where(and(eq(decks.clerkUserId, userId), notInArray(decks.status, ["failed", "cancelled"]), ...(name ? [ilike(decks.title, `%${name.replace(/[%_\\]/g, "")}%`)] : [])))
    .orderBy(sql`${decks.chatId} = ${call.chatId} DESC NULLS LAST`, desc(decks.createdAt))
    .limit(5);
  return rows.map(({ chatId, ...deck }) => ({ ...deck, building: BUILDING.includes(deck.status), fromThisChat: chatId === call.chatId }));
}

const slideTitle = (slide: object) => ("title" in slide && typeof slide.title === "string" ? slide.title : "");

/**
 * Shows a slide (1-based) of one of the owner's decks. The first time, the bot starts sharing its
 * screen; if the meeting refuses, the slides go on its tile instead. Returns what the mate needs to
 * narrate: the slide's title and speaker notes, and where it is in the deck.
 */
export async function present(userId: string, callId: string, input: { deckId: string; slide: number }) {
  const call = await liveMeeting(userId, callId);
  if (!z.string().uuid().safeParse(input.deckId).success) throw new PresentError("NOT_FOUND", "That deck wasn’t found.");
  const [deck] = await getDb().select().from(decks).where(and(eq(decks.id, input.deckId), eq(decks.clerkUserId, userId)));
  if (!deck) throw new PresentError("NOT_FOUND", "That deck wasn’t found.");
  if (BUILDING.includes(deck.status)) return { status: "building" as const, deck: { id: deck.id, title: deck.title, built: deck.built, total: deck.total } };
  if (!deck.slides.length) throw new PresentError("UNFINISHED", "That deck didn’t finish building.");

  const total = deck.slides.length;
  const index = Math.min(total, Math.max(1, Math.round(input.slide) || 1));
  const previous = call.meeting?.presentation ?? null;
  let mode = previous?.mode;
  if (!mode) {
    mode = "tile";
    if (call.meeting?.botId) {
      try {
        await startScreenshare(call.meeting.botId, sharePageUrl(call.id, signShareToken(call.id)));
        mode = "screenshare";
      } catch (error) {
        console.warn("presentation_screenshare_failed", { callId, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await savePresentation(call.id, { deckId: deck.id, slide: index, mode, version: deck.version, startedAt: previous?.startedAt ?? new Date().toISOString() });
  const slide = deck.slides[index - 1]!;
  return {
    status: "presenting" as const,
    mode,
    deck: { id: deck.id, title: deck.title, total },
    slide: { index, title: slideTitle(slide), notes: slide.notes, layout: slide.layout },
  };
}

/** Stops presenting: the screen share ends (the camera and voice carry on). */
export async function stopPresenting(userId: string, callId: string) {
  const call = await liveMeeting(userId, callId);
  const current = call.meeting?.presentation;
  if (current?.mode === "screenshare" && call.meeting?.botId)
    await stopScreenshare(call.meeting.botId).catch((error) => console.warn("presentation_stop_failed", { callId, message: error instanceof Error ? error.message : String(error) }));
  await savePresentation(call.id, null);
  return { stopped: !!current };
}

// ---- What the pages read ----------------------------------------------------------------------

/** The share page proves itself with the share token; the camera page (tile fallback) with its page token. */
async function readableMeeting(callId: string, auth: { share?: string; page?: string }) {
  const call = await meetingById(callId);
  if (!call || ENDED.includes(call.status)) return null;
  const allowed = verifyShareToken(auth.share, call.id) || pageTokenMatches(auth.page, call.meeting?.pageKey, call.createdAt);
  return allowed ? call : null;
}

/** Polled by the pages: which deck, which slide, and how it's shown. Small, so polling stays cheap. */
export async function presentationState(callId: string, auth: { share?: string; page?: string }) {
  const call = await readableMeeting(callId, auth);
  if (!call) return null;
  const p = call.meeting?.presentation;
  return { presentation: p ? { deckId: p.deckId, slide: p.slide, mode: p.mode, version: p.version } : null };
}

/** The deck being presented, fetched once (and again when it changes) to draw its slides. */
export async function presentationDeck(callId: string, auth: { share?: string; page?: string }) {
  const call = await readableMeeting(callId, auth);
  const p = call?.meeting?.presentation;
  if (!call || !p) return null;
  const [deck] = await getDb().select().from(decks).where(and(eq(decks.id, p.deckId), eq(decks.clerkUserId, call.clerkUserId)));
  if (!deck) return null;
  return { deck: { id: deck.id, title: deck.title, theme: deck.theme, meta: deck.meta, slides: deck.slides, sources: deck.sources, version: deck.version } };
}
