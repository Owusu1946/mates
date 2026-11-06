import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createChatStore } from "./chats.js";

const user = "user_owner";
const headers = {
  authorization: "Bearer test",
  "content-type": "application/json",
};
const item = {
  parentId: null,
  message: {
    id: "message_1",
    role: "user",
    createdAt: new Date().toISOString(),
    content: [{ type: "text", text: "Hello" }],
  },
};
function setup() {
  const store = createChatStore();
  const chat = {
    id: "chat_1",
    clerkUserId: user,
    title: "Hello",
    status: "regular" as const,
    kind: "legacy" as const,
    mateId: null,
    leaderMateId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.list = vi.fn(async () => [{ ...chat, mate: null, members: [], preview: null }]);
  store.get = vi.fn(async (userId, id) =>
    userId === user && id === chat.id ? chat : null,
  );
  store.initialize = vi.fn(async (userId, id) =>
    userId === user && id === chat.id ? chat : null,
  );
  store.update = vi.fn(async () => chat);
  store.delete = vi.fn(async () => false);
  store.history = vi.fn(async (userId, id) =>
    userId === user && id === chat.id ? [item] : null,
  );
  store.save = vi.fn(async () => true);
  store.deleteMessages = vi.fn(async () => true);
  return {
    store,
    app: createApp({ verifyToken: async () => ({ sub: user }), chats: store }),
  };
}
describe("Persistent chats API", () => {
  it("requires Clerk authentication before touching storage", async () => {
    const { app, store } = setup();
    for (const path of ["/v1/chats", "/v1/chats/chat_1/messages"])
      expect((await app.request(path)).status).toBe(401);
    expect(store.list).not.toHaveBeenCalled();
    expect(store.history).not.toHaveBeenCalled();
  });
  it("uses the verified subject for every operation", async () => {
    const { app, store } = setup();
    expect((await app.request("/v1/chats", { headers })).status).toBe(200);
    expect(store.list).toHaveBeenCalledWith(user);
    expect(
      (
        await app.request("/v1/chats/chat_1/messages", {
          method: "PUT",
          headers,
          body: JSON.stringify({ ...item, userId: "attacker" }),
        })
      ).status,
    ).toBe(200);
    expect(store.save).toHaveBeenCalledWith(user, "chat_1", item);
  });
  it("returns missing for chats owned by someone else", async () => {
    const { app } = setup();
    for (const path of [
      "/v1/chats/other_chat",
      "/v1/chats/other_chat/messages",
    ])
      expect((await app.request(path, { headers })).status).toBe(404);
    expect(
      (await app.request("/v1/chats/other_chat", { method: "PUT", headers }))
        .status,
    ).toBe(404);
  });
  it("rejects malformed messages before saving", async () => {
    const { app, store } = setup();
    const response = await app.request("/v1/chats/chat_1/messages", {
      method: "PUT",
      headers,
      body: JSON.stringify({ message: { role: "user" } }),
    });
    expect(response.status).toBe(400);
    expect(store.save).not.toHaveBeenCalled();
  });
  it("keeps backend failures separate from authentication failures", async () => {
    const { app, store } = setup();
    store.list = vi.fn(async () => {
      throw new Error("Database unavailable");
    });
    // createApp captures the store object, so replacing a method exercises the real error handler.
    const response = await app.request("/v1/chats", { headers });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
  });
});
