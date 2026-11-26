import { useSyncExternalStore } from "react";

/**
 * Messages you pinned in each chat, saved on this device per account (the API keeps no message
 * pins), like the pinned chats in the sidebar (sidebar/pins.ts). Keyed by the stored message, so a
 * pin survives the chat reloading.
 */

type Pins = Record<string, string[]>;
const keyOf = (userId: string) => `mates.message-pins.${userId}`;
const listeners = new Set<() => void>();
let current: { userId: string; pins: Pins } | null = null;

function load(userId: string): Pins {
  if (current?.userId === userId) return current.pins;
  let pins: Pins = {};
  try {
    const value = JSON.parse(localStorage.getItem(keyOf(userId)) ?? "{}") as unknown;
    if (value && typeof value === "object") pins = Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === "string")));
  } catch {
    // Unreadable: no pins yet.
  }
  current = { userId, pins };
  return pins;
}

export function toggleMessagePin(userId: string, chatId: string, messageId: string) {
  const pins = load(userId);
  const chat = pins[chatId] ?? [];
  const next = chat.includes(messageId) ? chat.filter((id) => id !== messageId) : [...chat, messageId];
  const updated = { ...pins, [chatId]: next };
  current = { userId, pins: updated };
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify(updated));
  } catch {
    // Not saved, but it holds for this session.
  }
  for (const listener of listeners) listener();
}

/** Signing out forgets this account's pins on this device. */
export function forgetMessagePins(userId: string) {
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

const NONE: string[] = [];

/** The stored ids of the messages pinned in a chat. */
export function useMessagePins(userId: string | null | undefined, chatId: string): string[] {
  return useSyncExternalStore(subscribe, () => (userId ? (load(userId)[chatId] ?? NONE) : NONE));
}
