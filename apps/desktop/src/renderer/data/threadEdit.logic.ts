import type { StoredItem, StoredMessage } from "@muse-clone/client-core";

/**
 * Changes to a chat held on this device, made before the server says so: your message the moment
 * you send it, and a reply as it streams. Pure, so the rules are tested without React; the next
 * refresh from the server merges over them (planMerge), keeping the same messages.
 */

/** A chat as held on this device: its messages with their parents, the one it reads down to, and whether older ones are left. */
export type Thread = { items: StoredItem[]; headId: string | null; hasMore: boolean; live: string[] };

export const emptyThread = (): Thread => ({ items: [], headId: null, hasMore: false, live: [] });

/** Your message, shown at once under the one it follows; the chat reads on to it. */
export function withSent(thread: Thread, message: { id: string; text: string; createdAt: string }, parentId: string | null): Thread {
  if (thread.items.some((item) => item.message.id === message.id)) return thread;
  const stored: StoredMessage = { id: message.id, role: "user", createdAt: message.createdAt, content: [{ type: "text", text: message.text }] };
  return { ...thread, items: [...thread.items, { message: stored, parentId }], headId: message.id };
}

export type ReplyWrite = { id: string; parentId: string; content: unknown[]; live: boolean; status?: StoredMessage["status"]; createdAt?: string };

/**
 * A reply as it stands: written in place if held, added under the message it answers if not
 * (and the chat reads on to it). While live it's in `live`; once settled it leaves.
 */
export function withReply(thread: Thread, reply: ReplyWrite): Thread {
  const content = reply.content as StoredMessage["content"];
  const status = reply.status ?? (reply.live ? { type: "running" } : { type: "complete", reason: "stop" });
  const held = thread.items.some((item) => item.message.id === reply.id);
  const items = held
    ? thread.items.map((item) => (item.message.id === reply.id ? { ...item, message: { ...item.message, content: content.length ? content : item.message.content, status } } : item))
    : [...thread.items, { message: { id: reply.id, role: "assistant" as const, createdAt: reply.createdAt ?? new Date().toISOString(), content, status }, parentId: reply.parentId }];
  const live = reply.live ? [...new Set([...thread.live, reply.id])] : thread.live.filter((id) => id !== reply.id);
  return { ...thread, items, live, headId: held ? thread.headId : reply.id };
}

/** Your message didn't reach the server: it leaves the chat (it's kept in the composer to send again). */
export function withoutMessages(thread: Thread, ids: string[]): Thread {
  const gone = new Set(ids);
  const items = thread.items.filter((item) => !gone.has(item.message.id));
  const head = thread.headId && gone.has(thread.headId) ? (thread.items.find((item) => item.message.id === thread.headId)?.parentId ?? null) : thread.headId;
  return { ...thread, items, headId: head && gone.has(head) ? (items.at(-1)?.message.id ?? null) : head, live: thread.live.filter((id) => !gone.has(id)) };
}
