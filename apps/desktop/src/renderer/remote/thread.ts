import { useAuth } from "@clerk/electron/react";
import { branchTo, cleanMessage, headOf, leafUnder, planMerge, rootPage, type StoredItem } from "@muse-clone/client-core";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toRows } from "../data/messages.logic.ts";
import { emptyThread, type Thread } from "../data/threadEdit.logic.ts";
import type { Message } from "../data/sampleCrew.ts";
import { read, useApi, type ApiClient } from "../lib/api.ts";
import { streamingReplies } from "./liveRuns.ts";


/** Messages per page, as on the phone: opening a chat, refreshing it, and each step back. */
const PAGE = 50;

export const threadKey = (userId: string | null | undefined, chatId: string) => ["thread", userId, chatId] as const;

type Page = { items: StoredItem[]; headId: string | null; hasMore: boolean; live: string[]; realParents: Map<string, string | null> };

async function fetchPage(api: ApiClient, chatId: string, before?: string): Promise<Page> {
  const response = await api.v1.chats[":id"].messages.$get({ param: { id: chatId }, query: { limit: PAGE, ...(before ? { before } : {}) } });
  // A mate you haven't talked to yet has no chat until the first message: that's an empty chat.
  if (response.status === 404) return { items: [], headId: null, hasMore: false, live: [], realParents: new Map() };
  const body = await read<{ messages?: { parentId: string | null; message: unknown }[]; hasMore?: boolean; headId?: string | null }>(response, "Couldn’t load this chat.");
  const live: string[] = [];
  const items = (body.messages ?? []).flatMap((row): StoredItem[] => {
    const cleaned = cleanMessage(row.message);
    if (!cleaned) return [];
    if (cleaned.live) live.push(cleaned.message.id);
    return [{ message: cleaned.message, parentId: row.parentId ?? null }];
  });
  return { items, headId: body.headId ?? headOf(items), hasMore: Boolean(body.hasMore), live, realParents: new Map(items.map((item) => [item.message.id, item.parentId])) };
}

/** Changes a held chat in place (a sent message, a streamed reply); a chat not held yet starts empty. */
export function updateThread(client: QueryClient, key: readonly unknown[], change: (thread: Thread) => Thread) {
  client.setQueryData<Thread>(key, (thread) => change(thread ?? emptyThread()));
}

/**
 * Brings the held copy up to date with the newest page, the phone's way (remote-chats.ts): only
 * what changed is swapped in, so unchanged rows keep their objects and don't redraw. A page that
 * no longer joins on (the chat moved far while this device was away) starts over from that page.
 */
function mergeNewest(held: Thread | undefined, fetched: Page): Thread {
  // A reply streaming here is newer than any saved copy: the page doesn't touch it (T3 Code's rule).
  const streaming = held ? held.items.filter((item) => streamingReplies.has(item.message.id)).map((item) => item.message.id) : [];
  const page = streaming.length ? { ...fetched, items: fetched.items.filter((item) => !streaming.includes(item.message.id)), live: [...new Set([...fetched.live, ...streaming])] } : fetched;
  if (!held || !held.items.length) return { items: rootPage(page.items), headId: page.headId, hasMore: page.hasMore, live: page.live };
  const plan = planMerge({ headId: held.headId, messages: held.items }, page.items, { realParents: page.realParents, serverHead: page.headId });
  if (!plan) return { ...held, live: page.live };
  if (!plan.connected) return { items: rootPage(page.items), headId: page.headId, hasMore: page.hasMore, live: page.live };
  return { items: plan.messages, headId: plan.headId, hasMore: held.hasMore, live: page.live };
}

export type { Thread };

export type ThreadState = {
  rows: Message[];
  thread: Thread | undefined;
  /** Nothing held and the first page still loading. */
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingEarlier: boolean;
  loadEarlier: () => void;
  /** Reads the chat along another version of a reply (and on to that branch's end). */
  showVersion: (storedId: string) => void;
  refresh: () => void;
};

/**
 * One chat's history (GET /v1/chats/:id/messages): the copy held on this device first, then the
 * newest page merged in, again on focus and whenever asked. Closed chats stay held for half an
 * hour, so going back is instant (T3 Code keeps them a few minutes; desktops have the memory).
 */
export function useThread(chatId: string, defaultAuthor: string): ThreadState {
  const { userId } = useAuth();
  const api = useApi();
  const client = useQueryClient();
  const key = threadKey(userId, chatId);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const query = useQuery({
    queryKey: key,
    queryFn: async () => mergeNewest(client.getQueryData<Thread>(key), await fetchPage(api, chatId)),
    staleTime: 10_000,
    gcTime: 30 * 60_000,
    enabled: Boolean(userId),
  });
  const thread = query.data;

  async function loadEarlier() {
    const top = thread && branchTo(thread.items, thread.headId)[0]?.message.id;
    if (!top || !thread?.hasMore || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const page = await fetchPage(api, chatId, top);
      updateThread(client, key, (held) => {
        const plan = planMerge({ headId: held.headId, messages: held.items }, page.items, { realParents: page.realParents, keepHead: true });
        return { ...held, items: plan?.messages ?? held.items, hasMore: page.hasMore };
      });
    } catch {
      // Scrolling up again tries again; the chat on screen is unchanged.
    } finally {
      setLoadingEarlier(false);
    }
  }

  return {
    rows: thread ? toRows(thread.items, thread.headId, { defaultAuthor, live: new Set(thread.live), now: new Date() }) : [],
    thread,
    loading: !thread && query.isPending,
    error: !thread && query.error ? query.error.message : null,
    hasMore: Boolean(thread?.hasMore),
    loadingEarlier,
    loadEarlier: () => void loadEarlier(),
    showVersion: (storedId) => updateThread(client, key, (held) => ({ ...held, headId: leafUnder(held.items, storedId) })),
    refresh: () => void client.invalidateQueries({ queryKey: key }),
  };
}
