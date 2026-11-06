import type {
  RemoteThreadListAdapter,
  ThreadHistoryAdapter,
} from "@assistant-ui/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createApiClient } from "../data/api";

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

  const list: RemoteThreadListAdapter = {
    async list() {
      await serialized(flush);
      await importLocal();
      const data = await (await checked(client.v1.chats.$get())).json();
      return { threads: data.chats.map(metadata) };
    },
    initialize,
    async fetch(id) {
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
  ): ThreadHistoryAdapter {
    return {
      async load() {
        const id = getRemoteId();
        if (!id) return { messages: [] };
        const data = await (
          await checked(endpoint(id).messages.$get({ param: { id } }))
        ).json();
        if (!("messages" in data)) throw new Error("Chat not found");
        const messages = data.messages as unknown as HistoryItem[];
        // The head is the newest leaf, not the newest row: rows saved with a skewed clock
        // can sort a reply before its question, which would hide the reply's branch.
        const parents = new Set(messages.map((item) => item.parentId));
        const leaves = messages.filter((item) => !parents.has(item.message.id));
        return {
          messages: messages.map((item) => {
            // Older rows may lack a status or hold malformed parts; one must not break the chat.
            const raw = item.message as unknown as { role: string; content?: unknown; status?: unknown };
            const content = Array.isArray(raw.content) ? raw.content.filter((part) => typeof (part as { type?: unknown })?.type === "string") : [];
            return {
              ...item,
              message: {
                ...item.message,
                content: content.length || raw.role !== "assistant" ? content : [{ type: "text", text: "" }],
                ...(raw.role === "assistant" && !raw.status ? { status: { type: "complete", reason: "unknown" } } : {}),
                createdAt: new Date(item.message.createdAt),
              } as typeof item.message,
            };
          }),
          headId: (leaves.at(-1) ?? messages.at(-1))?.message.id,
        };
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
    sync: {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot: () => error,
      retry: () => serialized(flush),
    },
  };
}
