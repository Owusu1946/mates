import { useAuth } from "@clerk/electron/react";
import { branchTo, runRequest, type StoredItem } from "@muse-clone/client-core";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { withReply, withSent, type Thread } from "../data/threadEdit.logic.ts";
import { ApiError, apiFetch, ensureOk, type GetToken } from "../lib/api.ts";
import { followRun, stopFollowing } from "./liveRuns.ts";
import { threadKey, updateThread } from "./thread.ts";

/**
 * Talking to a mate through the API, the phone's way (chat-model.ts, background-chat.ts):
 *
 * 1. The chat is made if it's new (PUT /v1/chats/:id).
 * 2. Your message is saved with the message it follows (PUT /v1/chats/:id/messages): the run
 *    saves it too, but without its place in the conversation.
 * 3. The run is asked for (POST /v1/runs), streaming the reply on the same response when it can,
 *    and followed (liveRuns.ts).
 *
 * Your message and a thinking reply show at once. Ids are chosen here, so a send that fails can be
 * sent again as the very same request: the same requestKey is the same run, never a second one.
 */

type Ask = {
  chatId: string;
  /** Your new message, or none when asking again for the reply to an earlier one. */
  user: { id: string; text: string; parentId: string | null } | null;
  /** The message the reply answers. */
  parentId: string;
  replyId: string;
};

/** Sends that didn't go, by your message's id: why, and how to send it again. */
type Failure = { reason: string; ask: Ask };
const failures = new Map<string, Failure>();
let failuresVersion = 0;
const listeners = new Set<() => void>();
const changed = () => {
  failuresVersion++;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Runs this window started, by reply id, so Stop knows which run to cancel. */
const runsByReply = new Map<string, string>();

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Why a send didn't go, in words for the row under it. */
function reasonOf(error: unknown): string {
  if (error instanceof ApiError && (error.code === "usage_limit" || error.code === "plan_required")) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Couldn’t reach your mate.";
}

async function ask(client: QueryClient, getToken: GetToken, userId: string, request: Ask) {
  const key = threadKey(userId, request.chatId);
  const chatPath = `/v1/chats/${encodeURIComponent(request.chatId)}`;
  if (request.user) {
    const sent = request.user;
    updateThread(client, key, (thread) => withSent(thread, { id: sent.id, text: sent.text, createdAt: new Date().toISOString() }, sent.parentId));
  }
  updateThread(client, key, (thread) => withReply(thread, { id: request.replyId, parentId: request.parentId, content: [], live: true }));
  try {
    await ensureOk(await apiFetch(getToken, chatPath, { method: "PUT" }), "Couldn’t start this chat.");
    if (request.user) {
      const message = { id: request.user.id, role: "user", createdAt: new Date().toISOString(), content: [{ type: "text", text: request.user.text }] };
      await ensureOk(await apiFetch(getToken, `${chatPath}/messages`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentId: request.user.parentId, message }) }), "Couldn’t send your message.");
    }
    const thread = client.getQueryData<Thread>(key);
    const history = branchTo(thread?.items ?? [], request.parentId).map((item: StoredItem) => item.message);
    const body = runRequest({ chatId: request.chatId, assistantMessageId: request.replyId, parentId: request.parentId, timezone: timezone(), history });
    const response = await ensureOk(
      await apiFetch(getToken, "/v1/runs", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream, application/json" }, body: JSON.stringify(body) }),
      "Couldn’t reach your mate.",
    );
    const streamed = response.headers.get("content-type")?.includes("text/event-stream");
    const runId = streamed ? response.headers.get("x-run-id") : ((await response.json()) as { runId?: string; id?: string }).runId;
    if (!runId) throw new Error("Your mate didn’t pick this up. Try again.");
    runsByReply.set(request.replyId, runId);
    if (request.user && failures.delete(request.user.id)) changed();
    followRun(client, getToken, { runId, chatKey: key, replyId: request.replyId, parentId: request.parentId, stream: streamed ? response.body : null });
  } catch (error) {
    // The thinking reply goes; your message stays, marked, to send again as the same request.
    updateThread(client, key, (thread) => ({ ...thread, items: thread.items.filter((item) => item.message.id !== request.replyId), live: thread.live.filter((id) => id !== request.replyId), headId: thread.headId === request.replyId ? request.parentId : thread.headId }));
    if (request.user) {
      failures.set(request.user.id, { reason: reasonOf(error), ask: request });
      changed();
    }
    throw error;
  }
}

export type ChatActions = {
  /** Sends your message after the one the chat reads down to. */
  send: (text: string) => Promise<void>;
  /** Asks again for the reply to `userMessageId` (a new version beside the old one). */
  regenerate: (userMessageId: string) => Promise<void>;
  /** Your message changed: sent as a new version of it, and the mate answers again from there. */
  edit: (messageId: string, text: string) => Promise<void>;
  /** Sends a message that didn't go, as the same request. */
  retry: (messageId: string) => Promise<void>;
  /** Stops the reply being written. */
  stop: () => Promise<void>;
  /** Why each of your messages that didn't go failed. */
  failed: Map<string, string>;
};

export function useChatActions(chatId: string): ChatActions {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  useSyncExternalStore(subscribe, () => failuresVersion);
  const token: GetToken = () => getToken();
  const key = threadKey(userId, chatId);
  const thread = () => client.getQueryData<Thread>(key);
  const run = (request: Ask) => (userId ? ask(client, token, userId, request).catch(() => undefined) : Promise.resolve());
  const id = () => crypto.randomUUID();

  return {
    send: (text) => {
      const userMessage = id();
      return run({ chatId, user: { id: userMessage, text, parentId: thread()?.headId ?? null }, parentId: userMessage, replyId: id() });
    },
    regenerate: (userMessageId) => run({ chatId, user: null, parentId: userMessageId, replyId: id() }),
    edit: (messageId, text) => {
      const original = thread()?.items.find((item) => item.message.id === messageId);
      const userMessage = id();
      return run({ chatId, user: { id: userMessage, text, parentId: original?.parentId ?? null }, parentId: userMessage, replyId: id() });
    },
    retry: (messageId) => {
      const failure = failures.get(messageId);
      return failure ? run(failure.ask) : Promise.resolve();
    },
    stop: async () => {
      const live = thread()?.live ?? [];
      const runIds = live.map((replyId) => runsByReply.get(replyId)).filter((runId): runId is string => Boolean(runId));
      // A reply started elsewhere: find its run.
      if (!runIds.length) {
        const response = await apiFetch(token, `/v1/runs?chatId=${encodeURIComponent(chatId)}`).catch(() => null);
        const body = response?.ok ? ((await response.json()) as { runs?: { id: string; status: string }[] }) : null;
        runIds.push(...(body?.runs ?? []).filter((candidate) => candidate.status === "queued" || candidate.status === "running").map((candidate) => candidate.id));
      }
      // The follower stays on to receive "cancelled"; it's only dropped if the server can't be told.
      await Promise.all(runIds.map((runId) => apiFetch(token, `/v1/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" }).catch(() => stopFollowing(runId))));
    },
    failed: new Map([...failures].filter(([, failure]) => failure.ask.chatId === chatId).map(([messageId, failure]) => [messageId, failure.reason])),
  };
}
