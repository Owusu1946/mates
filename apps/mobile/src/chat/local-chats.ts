import type {
  RemoteThreadListAdapter,
  ThreadHistoryAdapter,
} from "@assistant-ui/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type StoredMessage = Awaited<
  ReturnType<ThreadHistoryAdapter["load"]>
>["messages"][number];
type StoredChat = {
  id: string;
  title: string;
  status: "regular" | "archived";
  updatedAt: string;
  messages: StoredMessage[];
};

type TitleStream = Awaited<
  ReturnType<RemoteThreadListAdapter["generateTitle"]>
>;
type TitleChunk =
  TitleStream extends ReadableStream<infer Chunk> ? Chunk : never;

export function createLocalChats(userId: string) {
  const storageKey = `cooper:chats:${userId}:v1`;
  let chats: StoredChat[] | null = null;
  let loading: Promise<StoredChat[]> | null = null;
  let writeQueue = Promise.resolve();

  async function read() {
    if (chats) return chats;
    if (!loading)
      loading = (async () => {
        try {
          const raw = await AsyncStorage.getItem(storageKey);
          const parsed: unknown = raw ? JSON.parse(raw) : [];
          chats = Array.isArray(parsed)
            ? (parsed.filter(
                (item) =>
                  typeof item?.id === "string" && Array.isArray(item?.messages),
              ) as StoredChat[])
            : [];
        } catch {
          chats = [];
        }
        return chats;
      })();
    return loading;
  }

  function persist() {
    const snapshot = JSON.stringify(chats ?? []);
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(storageKey, snapshot));
    return writeQueue;
  }

  async function ensureChat(id: string) {
    const items = await read();
    let chat = items.find((item) => item.id === id);
    if (!chat) {
      chat = {
        id,
        title: "New chat",
        status: "regular",
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      items.unshift(chat);
      await persist();
    }
    return chat;
  }

  function metadata(chat: StoredChat) {
    return {
      remoteId: chat.id,
      title: chat.title,
      status: chat.status,
      lastMessageAt: new Date(chat.updatedAt),
    };
  }

  const list: RemoteThreadListAdapter = {
    async list() {
      const items = await read();
      return {
        threads: items
          .filter((chat) => chat.status === "regular")
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(metadata),
      };
    },
    async initialize(localId) {
      await ensureChat(localId);
      return { remoteId: localId };
    },
    async fetch(id) {
      const items = await read();
      const chat = items.find((item) => item.id === id);
      if (!chat) throw new Error("Chat not found");
      return metadata(chat);
    },
    async rename(id, title) {
      const chat = await ensureChat(id);
      chat.title = title;
      chat.updatedAt = new Date().toISOString();
      await persist();
    },
    async archive(id) {
      const chat = (await read()).find((item) => item.id === id);
      if (chat) {
        chat.status = "archived";
        await persist();
      }
    },
    async unarchive(id) {
      const chat = (await read()).find((item) => item.id === id);
      if (chat) {
        chat.status = "regular";
        await persist();
      }
    },
    async delete(id) {
      chats = (await read()).filter((item) => item.id !== id);
      await persist();
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
      const chat = (await read()).find((item) => item.id === id);
      if (chat) {
        chat.title = title;
        chat.updatedAt = new Date().toISOString();
        await persist();
      }
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

  function history(id: string): ThreadHistoryAdapter {
    return {
      async load() {
        const chat = (await read()).find((item) => item.id === id);
        return {
          messages: (chat?.messages ?? []).map((item) => ({
            ...item,
            message: {
              ...item.message,
              createdAt: new Date(item.message.createdAt),
            },
          })),
        };
      },
      async append(item) {
        const chat = await ensureChat(id);
        const index = chat.messages.findIndex(
          (entry) => entry.message.id === item.message.id,
        );
        if (index >= 0) chat.messages[index] = item;
        else chat.messages.push(item);
        chat.updatedAt = new Date().toISOString();
        await persist();
      },
      async update(item) {
        const chat = await ensureChat(id);
        const index = chat.messages.findIndex(
          (entry) => entry.message.id === item.message.id,
        );
        if (index >= 0) chat.messages[index] = item;
        else chat.messages.push(item);
        chat.updatedAt = new Date().toISOString();
        await persist();
      },
      async delete(items) {
        const chat = (await read()).find((entry) => entry.id === id);
        if (!chat) return;
        const ids = new Set(items.map((item) => item.message.id));
        chat.messages = chat.messages.filter(
          (item) => !ids.has(item.message.id),
        );
        await persist();
      },
    };
  }

  return { list, history };
}
