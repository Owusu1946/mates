import { useSyncExternalStore } from "react";
import { markSeen, parseSeen, type Seen } from "../data/unread.logic.ts";

/** When you last looked at each chat, saved on this device per account (data/unread.logic.ts). */

const keyOf = (userId: string) => `mates.seen.${userId}`;
const listeners = new Set<() => void>();
let current: { userId: string; seen: Seen } | null = null;

function load(userId: string): Seen {
  if (current?.userId === userId) return current.seen;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(keyOf(userId));
  } catch {
    // Unreadable storage starts fresh: everything so far counts as read.
  }
  const seen = parseSeen(raw, Date.now());
  current = { userId, seen };
  if (raw === null) save(userId, seen);
  return seen;
}

function save(userId: string, seen: Seen) {
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify(seen));
  } catch {
    // Not saved, but it still holds for this session.
  }
}

export function markChatSeen(userId: string, chatId: string, at = Date.now()) {
  const before = load(userId);
  const seen = markSeen(before, chatId, at);
  if (seen === before) return;
  current = { userId, seen };
  save(userId, seen);
  for (const listener of listeners) listener();
}

/** Signing out forgets this account's read times here too. */
export function forgetSeen(userId: string) {
  try {
    localStorage.removeItem(keyOf(userId));
  } catch {
    // Nothing saved to forget.
  }
  if (current?.userId === userId) current = null;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useSeen(userId: string): Seen {
  return useSyncExternalStore(subscribe, () => load(userId));
}
