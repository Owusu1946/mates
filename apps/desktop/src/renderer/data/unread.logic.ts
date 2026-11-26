/**
 * Unread, worked out on this device: the API keeps no read state, so a chat is unread when its
 * last message came after you last looked at it here. Your own messages never count, and on a
 * device's first sight of an account everything already there counts as read, rather than every
 * chat lighting up at once.
 */

export type Seen = {
  /** When this device first loaded this account: older messages count as read. */
  since: number;
  /** When you last looked at each chat. */
  chats: Record<string, number>;
};

export function isUnread(chat: { id: string; at: string | null; lastFrom: string | null }, seen: Seen): boolean {
  if (!chat.at || chat.lastFrom === "you") return false;
  const at = Date.parse(chat.at);
  return Number.isFinite(at) && at > Math.max(seen.since, seen.chats[chat.id] ?? 0);
}

/** Read from storage, tolerating anything malformed (a fresh start reads everything up to `now`). */
export function parseSeen(raw: string | null, now: number): Seen {
  try {
    const value = JSON.parse(raw ?? "") as Partial<Seen>;
    if (typeof value.since !== "number" || !value.chats || typeof value.chats !== "object") throw new Error("malformed");
    const chats = Object.fromEntries(Object.entries(value.chats).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
    return { since: value.since, chats };
  } catch {
    return { since: now, chats: {} };
  }
}

/** Looked at a chat now; the time only moves forward. */
export const markSeen = (seen: Seen, chatId: string, at: number): Seen => (at > (seen.chats[chatId] ?? 0) ? { ...seen, chats: { ...seen.chats, [chatId]: at } } : seen);
