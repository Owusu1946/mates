import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

/**
 * The last known chats and messages, kept on the device per user and loaded into memory once
 * (while the splash shows). The app draws them on its first frame and refreshes from the
 * server after, the way ChatGPT opens instantly.
 *
 * Reads are synchronous from memory. Writes skip unchanged values, so a refresh that finds
 * nothing new costs no disk work. Message history is capped per chat and across chats.
 */

const PREFIX = "mates:cache:v1";
/** Chats whose recent messages are kept; the least recently opened is dropped first. */
const MAX_HISTORIES = 10;
/** A chat larger than this (serialised) isn't cached; it simply loads from the server. */
const MAX_ENTRY_CHARS = 200_000;
const HISTORY = "history:";
const HISTORY_INDEX = "history-index";

type Entry = { at: number; json: string };

let owner: string | null = null;
let hydration: Promise<void> | null = null;
let hydratedFor: string | null = null;
const memory = new Map<string, Entry>();

const storageKey = (userId: string, key: string) => `${PREFIX}:${userId}:${key}`;

/** Loads one user's cache into memory. Safe to call repeatedly; switching users starts afresh. */
export function hydrateCache(userId: string): Promise<void> {
  if (owner === userId && hydration) return hydration;
  owner = userId;
  hydratedFor = null;
  memory.clear();
  const prefix = storageKey(userId, "");
  hydration = AsyncStorage.getAllKeys()
    .then((keys) => AsyncStorage.multiGet(keys.filter((key) => key.startsWith(prefix))))
    .then((pairs) => {
      if (owner !== userId) return;
      for (const [key, raw] of pairs) {
        if (!raw) continue;
        try {
          memory.set(key.slice(prefix.length), JSON.parse(raw) as Entry);
        } catch {
          void AsyncStorage.removeItem(key).catch(() => undefined);
        }
      }
    })
    .catch(() => undefined)
    .finally(() => {
      if (owner === userId) hydratedFor = userId;
    });
  return hydration;
}

/** True once this user's cache is in memory. A failed read still counts: the app works without it. */
export function useCacheReady(userId: string | null) {
  const [ready, setReady] = useState(!!userId && hydratedFor === userId);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    void hydrateCache(userId).then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [userId]);
  return ready;
}

export function readCache<T>(key: string): { data: T; at: number } | undefined {
  const entry = memory.get(key);
  if (!entry) return undefined;
  try {
    return { data: JSON.parse(entry.json) as T, at: entry.at };
  } catch {
    return undefined;
  }
}

/** Stores a value; returns whether it differed from what was cached. */
export function writeCache(key: string, data: unknown): boolean {
  if (!owner) return false;
  const json = JSON.stringify(data);
  if (json.length > MAX_ENTRY_CHARS) return false;
  const previous = memory.get(key);
  const changed = previous?.json !== json;
  const entry: Entry = { at: Date.now(), json };
  memory.set(key, entry);
  // Unchanged data only refreshes its timestamp in memory; the disk copy is already right.
  if (changed) void AsyncStorage.setItem(storageKey(owner, key), JSON.stringify(entry)).catch(() => undefined);
  return changed;
}

/** Keeps a chat's recent messages, dropping the least recently opened chat beyond the cap. */
export function writeHistoryCache(chatId: string, data: unknown): boolean {
  if (!owner) return false;
  const userId = owner;
  const changed = writeCache(HISTORY + chatId, data);
  const recent = readCache<string[]>(HISTORY_INDEX)?.data ?? [];
  const next = [chatId, ...recent.filter((id) => id !== chatId)];
  const dropped = next.splice(MAX_HISTORIES);
  if (next.join() !== recent.join()) writeCache(HISTORY_INDEX, next);
  for (const id of dropped) {
    memory.delete(HISTORY + id);
    void AsyncStorage.removeItem(storageKey(userId, HISTORY + id)).catch(() => undefined);
  }
  return changed;
}

export const readHistoryCache = <T,>(chatId: string) => readCache<T>(HISTORY + chatId)?.data;

/** On sign-out: nothing of this user's chats stays on the device. */
export async function clearCache(userId: string) {
  if (owner === userId) {
    memory.clear();
    owner = null;
    hydration = null;
    hydratedFor = null;
  }
  const prefix = storageKey(userId, "");
  const keys = (await AsyncStorage.getAllKeys().catch(() => [] as readonly string[])).filter((key) => key.startsWith(prefix));
  if (keys.length) await AsyncStorage.multiRemove(keys).catch(() => undefined);
}
