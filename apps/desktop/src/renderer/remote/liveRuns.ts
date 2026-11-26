import { applyRunEvent, applyRunSnapshot, readRunStreamEvents, retryDelay, settledContent, startProgress, type RunProgress } from "@muse-clone/client-core";
import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { liveChatOf, type LiveChat } from "../data/liveChat.logic.ts";
import { withReply } from "../data/threadEdit.logic.ts";
import { apiFetch, ensureOk, type GetToken } from "../lib/api.ts";
import { updateThread } from "./thread.ts";

/**
 * Following a mate's reply as it's written (a durable run, apps/api/src/durable-runs.ts), into the
 * chat held on this device. One follower per run, whoever asked: a send here, or a run noticed
 * from another device. The rules for each event live in client-core (runProgress.ts):
 *
 * - The SSE stream (GET /v1/runs/:id/events) is followed from its cursor. If it drops, it
 *   reconnects from there with growing, jittered waits, so nothing is doubled or missed.
 * - After a few failed reconnects it reads the run's saved state instead (GET /v1/runs/:id),
 *   which works through anything that blocks streaming, and keeps trying the stream.
 * - A hand-off to the background worker keeps the same run and cursor, so following just goes on.
 * - Settled, the reply is written as it ended and the chat list refreshes for its preview.
 */

export type RunTarget = {
  runId: string;
  chatKey: readonly unknown[];
  /** The reply's id and the message it answers. */
  replyId: string;
  parentId: string;
  /** A stream already open: the live answer to the send that created the run. */
  stream?: ReadableStream<Uint8Array> | null;
};

const following = new Map<string, AbortController>();
/** Replies being written here right now: a refresh from the server must not overwrite them with an older copy. */
export const streamingReplies = new Set<string>();
/** Reconnects in a row before it reads the run's saved state between tries. */
const STREAM_TRIES = 3;
/** Failures in a row before it stops following; the run carries on, and the next refresh shows it. */
const GIVE_UP_AFTER = 12;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });

/** What each chat's mate is doing because of a reply in progress, for faces and sidebar lines. */
let liveChats: Record<string, LiveChat> = {};
const liveListeners = new Set<() => void>();
function publish(chatId: string, value: LiveChat | null) {
  const { [chatId]: _, ...rest } = liveChats;
  liveChats = value ? { ...rest, [chatId]: value } : rest;
  for (const listener of liveListeners) listener();
}
const subscribeLive = (listener: () => void) => {
  liveListeners.add(listener);
  return () => liveListeners.delete(listener);
};
/** Chats with a reply in progress (or waiting on you), by chat id. */
export const useLiveChats = () => useSyncExternalStore(subscribeLive, () => liveChats);

export const isFollowing = (runId: string) => following.has(runId);

/** Stops following a run here (the run itself carries on unless it was cancelled). */
export function stopFollowing(runId: string) {
  following.get(runId)?.abort();
  following.delete(runId);
}

export function followRun(client: QueryClient, getToken: GetToken, target: RunTarget) {
  if (following.has(target.runId)) return;
  const controller = new AbortController();
  following.set(target.runId, controller);
  streamingReplies.add(target.replyId);
  void run(client, getToken, target, controller.signal).finally(() => {
    streamingReplies.delete(target.replyId);
    if (following.get(target.runId) === controller) following.delete(target.runId);
  });
}

async function run(client: QueryClient, getToken: GetToken, target: RunTarget, signal: AbortSignal) {
  let progress: RunProgress = startProgress();
  const chatId = String(target.chatKey[2]);
  publish(chatId, { phase: "thinking" });
  let stream = target.stream ?? null;
  let failures = 0;
  const write = (live: boolean) => {
    publish(chatId, liveChatOf(progress.content, progress.status, progress.settled));
    updateThread(client, target.chatKey, (thread) =>
      withReply(thread, {
        id: target.replyId,
        parentId: target.parentId,
        content: live ? progress.content : settledContent(progress),
        live,
        ...(live ? {} : { status: progress.status === "cancelled" ? { type: "incomplete", reason: "cancelled" } : progress.status === "failed" ? { type: "incomplete", reason: "error" } : { type: "complete", reason: "stop" } }),
      }),
    );
  };
  const apply = (next: RunProgress) => {
    if (next === progress) return;
    progress = next;
    failures = 0;
    write(!progress.settled);
  };

  while (!progress.settled && !signal.aborted && failures < GIVE_UP_AFTER) {
    try {
      const body = stream ?? (await openEvents(getToken, target.runId, progress.cursor, signal));
      stream = null;
      for await (const event of readRunStreamEvents(body, signal)) {
        apply(applyRunEvent(progress, event));
        if (progress.settled) break;
      }
      // The stream ended without the run settling (a proxy cut it): reconnect from the cursor.
      if (!progress.settled && !signal.aborted) failures++;
    } catch {
      if (signal.aborted) break;
      failures++;
    }
    if (progress.settled || signal.aborted) break;
    if (failures >= STREAM_TRIES) await readSaved(getToken, target.runId, progress, signal).then((snapshot) => snapshot && apply(snapshot), () => undefined);
    if (!progress.settled) await sleep(retryDelay(failures), signal);
  }

  if (signal.aborted || !progress.settled) publish(chatId, null);
  if (signal.aborted) return;
  if (!progress.settled) {
    // Not following any more: show what arrived as it stands; the next refresh brings the rest.
    updateThread(client, target.chatKey, (thread) => ({ ...thread, live: thread.live.filter((id) => id !== target.replyId) }));
  }
  // The preview in the sidebar and the stored reply catch up with how it ended.
  void client.invalidateQueries({ queryKey: ["chats"] });
  void client.invalidateQueries({ queryKey: target.chatKey });
}

async function openEvents(getToken: GetToken, runId: string, after: number, signal: AbortSignal) {
  const response = await ensureOk(
    await apiFetch(getToken, `/v1/runs/${encodeURIComponent(runId)}/events?after=${after}`, { headers: { accept: "text/event-stream", "last-event-id": String(after) }, signal }),
    "The live reply couldn’t be reached.",
  );
  if (!response.body) throw new Error("The live reply came back empty.");
  return response.body;
}

async function readSaved(getToken: GetToken, runId: string, progress: RunProgress, signal: AbortSignal) {
  const response = await ensureOk(await apiFetch(getToken, `/v1/runs/${encodeURIComponent(runId)}?after=${progress.cursor}`, { signal }), "The reply couldn’t be read.");
  const body = (await response.json()) as { run?: { sequence: number; content: unknown[]; status: string; error: string | null } };
  return body.run ? applyRunSnapshot(progress, body.run) : null;
}
