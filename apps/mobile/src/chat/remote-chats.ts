import type {
  RemoteThreadListAdapter,
  ThreadHistoryAdapter,
} from "@assistant-ui/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createApiClient } from "../data/api";
import { readCache, readHistoryCache, writeCache, writeHistoryCache } from "../data/offline-cache";
import { rootPage } from "./history-merge";

type HistoryItem = Awaited<
  ReturnType<ThreadHistoryAdapter["load"]>
>["messages"][number];
type ChatMetadata = {
  id: string;
  title: string;
  status: "regular" | "archived";
  updatedAt: string;
};
type TitleStream = Awaited<
  ReturnType<RemoteThreadListAdapter["generateTitle"]>
>;
type TitleChunk =
  TitleStream extends ReadableStream<infer Chunk> ? Chunk : never;
type Repository = Awaited<ReturnType<ThreadHistoryAdapter["load"]>>;
/** Server rows, ready to import, with the server's newest message and whether older ones are left. */
export type HistoryPage = { messages: Repository["messages"]; headId: string | null; hasMore: boolean };
export type ChatHistory = ThreadHistoryAdapter & {
  /** The newest few messages, for bringing an open chat up to date; `wide` for a bigger page. */
  refresh(wide?: boolean): Promise<HistoryPage>;
  /** The page above `oldestId` (the top of what's loaded). */
  loadEarlier(oldestId: string): Promise<HistoryPage>;
};
/** Whether a chat has older messages to load, and whether they're loading. */
export type ChatPaging = { hasMore: boolean; loading: boolean; known: boolean };

/** Cache key for the chat list the runtime opens chats from. */
const THREADS = "threads";
/** Messages kept per chat on the device: the newest branch only, enough to fill a screen or two. */
const CACHED_MESSAGES = 40;
/** Messages per page when opening a chat or scrolling back. */
const PAGE = 50;
/** Messages fetched to bring an open chat up to date: a reply being written is always among them. */
const TAIL = 12;

/** The newest leaf, not the newest row: rows saved with a skewed clock can sort a reply before its question. */
function headOf(items: HistoryItem[]) {
  const parents = new Set(items.map((item) => item.parentId));
  const leaves = items.filter((item) => !parents.has(item.message.id));
  return (leaves.at(-1) ?? items.at(-1))?.message.id;
}

/** The last messages on the current branch, re-rooted so the shortened chain stays valid. */
function recentBranch(items: HistoryItem[]): HistoryItem[] {
  const byId = new Map(items.map((item) => [item.message.id, item]));
  const chain: HistoryItem[] = [];
  for (let id = headOf(items); id && chain.length < CACHED_MESSAGES; ) {
    const item = byId.get(id);
    if (!item) break;
    chain.push(item);
    id = item.parentId ?? undefined;
  }
  chain.reverse();
  if (chain[0]) chain[0] = { ...chain[0], parentId: null };
  return chain;
}

/**
 * The metadata every assistant-ui message carries. Messages the server writes straight into a chat
 * (a computer or code result, a skipped step) may have none, and assistant-ui reads
 * `metadata.unstable_state` without a guard, so one such row would break loading the whole thread.
 */
export function withMetadata(metadata: unknown) {
  const given = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
  return { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {}, ...given };
}

/** Server or cached rows as a repository the runtime can import. */
function toRepository(items: HistoryItem[]): Repository {
  return {
    messages: items.map((item) => {
      // Older rows may lack a status or hold malformed parts; one must not break the chat.
      const raw = item.message as unknown as { role: string; content?: unknown; status?: { type?: string }; metadata?: { custom?: Record<string, unknown> } };
      const content = Array.isArray(raw.content) ? raw.content.filter((part) => typeof (part as { type?: unknown })?.type === "string") : [];
      // A reply the server is still writing (a mission round, a routine, a run started elsewhere)
      // is marked live rather than running: assistant-ui treats a trailing running message as this
      // phone's own run, which would lock the composer and stop history refreshes.
      const live = raw.role === "assistant" && raw.status?.type === "running";
      return {
        ...item,
        message: {
          ...item.message,
          content: content.length || raw.role !== "assistant" ? content : [{ type: "text", text: "" }],
          ...(raw.role === "assistant" && (!raw.status || live) ? { status: { type: "complete", reason: "unknown" } } : {}),
          metadata: live ? withMetadata({ ...raw.metadata, custom: { ...raw.metadata?.custom, live: true } }) : withMetadata(raw.metadata),
          createdAt: new Date(item.message.createdAt),
        } as typeof item.message,
      };
    }),
    headId: headOf(items),
  };
}

export function createRemoteChats(
  userId: string,
  getToken: () => Promise<string | null>,
) {
  const client = createApiClient(getToken);
  const endpoint = (_id: string) => client.v1.chats[":id"];
  let error: string | null = null;
  const listeners = new Set<() => void>();
  function report(value: string | null) {
    error = value;
    listeners.forEach((listener) => listener());
  }
  const json = (value: unknown) => ({
    init: { body: JSON.stringify(value) },
    headers: { "content-type": "application/json" },
  });
  async function checked<T extends { ok: boolean; status: number }>(
    response: Promise<T>,
  ) {
    try {
      const result = await response;
      if (!result.ok)
        throw new Error(
          result.status === 401
            ? "Your session expired. Please sign in again."
            : "Could not sync your chats. Please try again.",
        );
      return result;
    } catch (cause) {
      report(
        "Chat sync paused. Your unsynced messages are kept on this phone.",
      );
      throw cause;
    }
  }
  const metadata = (chat: ChatMetadata) => ({
    remoteId: chat.id,
    title: chat.title,
    status: chat.status,
    lastMessageAt: new Date(chat.updatedAt),
  });
  async function initialize(id: string) {
    await checked(endpoint(id).$put({ param: { id } }));
    return { remoteId: id };
  }
  async function update(
    id: string,
    values: { title?: string; status?: "regular" | "archived" },
  ) {
    await checked(endpoint(id).$patch({ param: { id } }, json(values)));
  }
  async function save(id: string, item: HistoryItem) {
    await checked(endpoint(id).messages.$put({ param: { id } }, json(item)));
  }

  const pendingKey = `cooper:pending-messages:${userId}:v1`;
  type Pending = { id: string; item: HistoryItem };
  let queue: Pending[] | undefined;
  let queueWork = Promise.resolve();
  async function pending() {
    queue ??= JSON.parse(
      (await AsyncStorage.getItem(pendingKey)) ?? "[]",
    ) as Pending[];
    return queue;
  }
  async function flush() {
    const items = await pending();
    while (items.length) {
      const next = items[0]!;
      await initialize(next.id);
      await save(next.id, next.item);
      items.shift();
      await AsyncStorage.setItem(pendingKey, JSON.stringify(items));
    }
    report(null);
  }
  function serialized(work: () => Promise<void>) {
    queueWork = queueWork.catch(() => undefined).then(work);
    return queueWork;
  }
  function enqueue(id: string, item: HistoryItem) {
    return serialized(async () => {
      const items = await pending();
      const index = items.findIndex(
        (entry) => entry.id === id && entry.item.message.id === item.message.id,
      );
      if (index >= 0) items[index] = { id, item };
      else items.push({ id, item });
      await AsyncStorage.setItem(pendingKey, JSON.stringify(items));
      await flush();
    });
  }

  // Import the existing device history once. Keep the original copy if any save fails.
  async function importLocal() {
    const key = `cooper:chats:${userId}:v1`;
    if (await AsyncStorage.getItem(`${key}:imported`)) return;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const old: {
      id: string;
      title: string;
      status: "regular" | "archived";
      messages: HistoryItem[];
    }[] = JSON.parse(raw);
    for (const chat of old) {
      await initialize(chat.id);
      for (const item of chat.messages) await save(chat.id, item);
      await update(chat.id, { title: chat.title, status: chat.status });
    }
    await AsyncStorage.setItem(`${key}:imported`, "true");
  }

  async function freshList() {
    await serialized(flush);
    await importLocal();
    const data = await (await checked(client.v1.chats.$get())).json();
    const chats: ChatMetadata[] = data.chats.map(({ id, title, status, updatedAt }) => ({ id, title, status, updatedAt }));
    writeCache(THREADS, chats);
    return chats;
  }

  // Chats refreshed from the server while a cached copy was on screen, for the open thread to merge.
  type FreshListener = (id: string, page: HistoryPage) => void;
  const freshListeners = new Set<FreshListener>();

  // Per chat: every message's real parent as the server knows it (pages arrive re-rooted at their
  // top), and whether older messages are left to load.
  const parents = new Map<string, Map<string, string | null>>();
  const paging = new Map<string, ChatPaging>();
  const pagingListeners = new Set<() => void>();
  const NO_PAGING: ChatPaging = { hasMore: false, loading: false, known: false };
  const earlier = new Map<string, () => Promise<void>>();
  function setPaging(id: string, value: Partial<ChatPaging>) {
    const current = paging.get(id) ?? NO_PAGING;
    const next = { ...current, ...value };
    if (next.hasMore === current.hasMore && next.loading === current.loading && next.known === current.known) return;
    paging.set(id, next);
    pagingListeners.forEach((listener) => listener());
  }

  async function fetchPage(id: string, limit: number, before?: string) {
    const query = before ? { limit, before } : { limit };
    const data = await (await checked(endpoint(id).messages.$get({ param: { id }, query }))).json();
    if (!("messages" in data)) throw new Error("Chat not found");
    const items = data.messages as unknown as HistoryItem[];
    const known = parents.get(id) ?? new Map<string, string | null>();
    for (const item of items) known.set(item.message.id, item.parentId ?? null);
    parents.set(id, known);
    const page: HistoryPage = {
      messages: toRepository(items).messages,
      // A server from before paging sends the whole history and no head: work it out from the rows.
      headId: "headId" in data && typeof data.headId === "string" ? data.headId : (headOf(items) ?? null),
      hasMore: "hasMore" in data && data.hasMore === true,
    };
    return { items, page };
  }
  async function revalidate(id: string) {
    const { items, page } = await fetchPage(id, PAGE);
    setPaging(id, { hasMore: page.hasMore, known: true });
    if (writeHistoryCache(id, recentBranch(items))) freshListeners.forEach((listener) => listener(id, page));
  }

  const list: RemoteThreadListAdapter = {
    // The cached list opens chats on the first frame; the server copy replaces it for next time.
    // The sidebar keeps its own live query, so nothing waits on this refresh.
    async list() {
      const cached = readCache<ChatMetadata[]>(THREADS)?.data;
      if (!cached) return { threads: (await freshList()).map(metadata) };
      void freshList().catch(() => undefined);
      return { threads: cached.map(metadata) };
    },
    initialize,
    async fetch(id) {
      const cached = readCache<ChatMetadata[]>(THREADS)?.data.find((chat) => chat.id === id);
      if (cached) return metadata(cached);
      const data = await (
        await checked(endpoint(id).$get({ param: { id } }))
      ).json();
      if (!("chat" in data)) throw new Error("Chat not found");
      return metadata(data.chat);
    },
    rename: (id, title) => update(id, { title }),
    archive: (id) => update(id, { status: "archived" }),
    unarchive: (id) => update(id, { status: "regular" }),
    async delete(id) {
      await checked(endpoint(id).$delete({ param: { id } }));
    },
    async generateTitle(id, messages) {
      const first = messages.find((message) => message.role === "user");
      const text =
        first?.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(" ")
          .trim() ?? "";
      const title =
        text.length > 42
          ? `${text.slice(0, 42).trimEnd()}…`
          : text || "New chat";
      await update(id, { title });
      return new ReadableStream<TitleChunk>({
        start(controller) {
          controller.enqueue({
            type: "part-start",
            path: [0],
            part: { type: "text" },
          });
          controller.enqueue({
            type: "text-delta",
            path: [0],
            textDelta: title,
          });
          controller.enqueue({ type: "part-finish", path: [0] });
          controller.close();
        },
      });
    },
  };
  function history(
    getRemoteId: () => string | undefined,
    initializeThread: () => Promise<{ remoteId: string }>,
    getLocalId: () => string,
  ): ChatHistory {
    return {
      // Cached messages first so the chat draws at once; the server's newest page follows and, if
      // it differs, reaches the open thread through onFreshHistory. Older messages load on scroll.
      async load() {
        const id = getRemoteId();
        if (!id) return { messages: [] };
        const cached = readHistoryCache<HistoryItem[]>(id);
        if (cached?.length) {
          void revalidate(id).catch(() => undefined);
          return toRepository(cached);
        }
        const { items, page } = await fetchPage(id, PAGE);
        setPaging(id, { hasMore: page.hasMore, known: true });
        writeHistoryCache(id, recentBranch(items));
        return toRepository(rootPage(items));
      },
      async refresh(wide = false) {
        const id = getRemoteId();
        if (!id) return { messages: [], headId: null, hasMore: false };
        return (await fetchPage(id, wide ? PAGE : TAIL)).page;
      },
      async loadEarlier(oldestId) {
        const id = getRemoteId();
        if (!id) return { messages: [], headId: null, hasMore: false };
        setPaging(id, { loading: true });
        try {
          const { page } = await fetchPage(id, PAGE, oldestId);
          setPaging(id, { hasMore: page.hasMore, loading: false, known: true });
          return page;
        } catch (cause) {
          setPaging(id, { loading: false });
          throw cause;
        }
      },
      async append(item) {
        await enqueue(getRemoteId() ?? getLocalId(), item);
        await initializeThread();
      },
      async update(item) {
        await enqueue(getRemoteId() ?? getLocalId(), item);
        await initializeThread();
      },
      async delete(items) {
        const { remoteId: id } = await initializeThread();
        if (items.length)
          await checked(
            endpoint(id).messages.$delete(
              { param: { id } },
              json({ ids: items.map((item) => item.message.id) }),
            ),
          );
      },
    };
  }
  return {
    list,
    history,
    onFreshHistory(listener: FreshListener) {
      freshListeners.add(listener);
      return () => {
        freshListeners.delete(listener);
      };
    },
    /** Every message's real parent in a chat, as far as the server has said. */
    parentsOf: (id: string) => parents.get(id) ?? new Map<string, string | null>(),
    sync: {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot: () => error,
      retry: () => serialized(flush),
      paging: {
        subscribe(listener: () => void) {
          pagingListeners.add(listener);
          return () => {
            pagingListeners.delete(listener);
          };
        },
        get: (id: string | undefined) => (id && paging.get(id)) || NO_PAGING,
        /** The open thread's runtime says how to load its earlier messages, by local thread id. */
        register(threadId: string, load: () => Promise<void>) {
          earlier.set(threadId, load);
          return () => {
            if (earlier.get(threadId) === load) earlier.delete(threadId);
          };
        },
        loadMore: (threadId: string) => void earlier.get(threadId)?.(),
      },
    },
  };
}
