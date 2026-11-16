import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { collaboratorAttachPlan, createChatStore, mayApplyAttach } from "./chats.js";

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
    kind: "mate" as const,
    mateId: "d4a6d498-9aee-4daa-920e-9b837bdd80c3",
    leaderMateId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.list = vi.fn(async () => [{ ...chat, mate: null, members: [], collaborators: [], preview: null }]);
  store.get = vi.fn(async (userId, id) =>
    userId === user && id === chat.id ? chat : null,
  );
  store.initialize = vi.fn(async (userId, id) =>
    userId === user && id === chat.id ? chat : null,
  );
  store.update = vi.fn(async () => chat);
  store.setCollaborators = vi.fn(async (userId: string, id: string, mateIds: string[]) =>
    userId === user && id === chat.id
      ? { ok: true as const, mateIds: [...new Set(mateIds)] }
      : { ok: false as const, reason: "NOT_FOUND" as const },
  );
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
    for (const path of ["/v1/chats", "/v1/chats/chat_1/messages"]) {
      expect((await app.request(path)).status, path).toBe(401);
    }
    expect((await app.request("/v1/chats/chat_1/collaborators", { method: "PUT" })).status).toBe(401);
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
  it("validates and stores collaborator IDs using the authenticated owner", async () => {
    const { app, store } = setup();
    const mateId = "8f4e4120-2958-49ae-aa6f-e4242713dc60";
    const response = await app.request("/v1/chats/chat_1/collaborators", {
      method: "PUT",
      headers,
      body: JSON.stringify({ mateIds: [mateId, mateId], userId: "attacker" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mateIds: [mateId] });
    expect(store.setCollaborators).toHaveBeenCalledWith(user, "chat_1", [mateId, mateId]);
  });
  it("rejects invalid collaborator payloads before storage", async () => {
    const { app, store } = setup();
    const response = await app.request("/v1/chats/chat_1/collaborators", {
      method: "PUT",
      headers,
      body: JSON.stringify({ mateIds: ["not-a-uuid"] }),
    });
    expect(response.status).toBe(400);
    expect(store.setCollaborators).not.toHaveBeenCalled();
  });
  it("returns 404 for a chat that is not an owned mate chat", async () => {
    const { app } = setup();
    const response = await app.request("/v1/chats/unknown_chat/collaborators", {
      method: "PUT",
      headers,
      body: JSON.stringify({ mateIds: [] }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
  it("accepts an empty collaborator list", async () => {
    const { app, store } = setup();
    const response = await app.request("/v1/chats/chat_1/collaborators", {
      method: "PUT",
      headers,
      body: JSON.stringify({ mateIds: [] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mateIds: [] });
    expect(store.setCollaborators).toHaveBeenCalledWith(user, "chat_1", []);
  });
  it("does not accept mates the chat owner cannot use", async () => {
    const { app, store } = setup();
    store.setCollaborators = vi.fn(async (_userId: string, _id: string, _mateIds: string[]) => ({ ok: false as const, reason: "INVALID_MATES" as const }));
    const response = await app.request("/v1/chats/chat_1/collaborators", {
      method: "PUT",
      headers,
      body: JSON.stringify({ mateIds: ["8f4e4120-2958-49ae-aa6f-e4242713dc60"] }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_COLLABORATORS" } });
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

describe("collaborator attachment", () => {
  const sent = new Date("2026-11-16T12:00:00.000Z");
  const ama = "8f4e4120-2958-49ae-aa6f-e4242713dc60";
  const nova = "1c0b9a2e-6d4f-4a1b-9c33-0e5d7a8b6c21";
  const primary = "d4a6d498-9aee-4daa-920e-9b837bdd80c3";

  it("adds one or several mates, and does not add the primary mate twice", () => {
    const plan = collaboratorAttachPlan({ requestedIds: [ama, ama, nova, primary], primaryId: primary, rows: [], sentAt: sent });
    expect(plan.insert.map((row) => row.mateId)).toEqual([ama, nova]);
    expect(plan.revive).toEqual([]);
  });

  it("stops at 19 attached mates", () => {
    const rows = Array.from({ length: 19 }, (_, position) => ({ mateId: `00000000-0000-4000-8000-${String(position).padStart(12, "0")}`, position, removedAt: null }));
    const plan = collaboratorAttachPlan({ requestedIds: [ama], primaryId: primary, rows, sentAt: sent });
    expect(plan.insert).toEqual([]);
  });

  it("does not undo a removal that happened after the message was sent", () => {
    const plan = collaboratorAttachPlan({
      requestedIds: [ama, nova],
      primaryId: primary,
      rows: [{ mateId: ama, position: 0, removedAt: new Date("2026-11-16T12:00:05.000Z") }],
      sentAt: sent,
    });
    expect(plan.revive).toEqual([]);
    expect(plan.insert.map((row) => row.mateId)).toEqual([nova]);
  });

  it("brings a mate back when a later message mentions them", () => {
    const plan = collaboratorAttachPlan({
      requestedIds: [ama],
      primaryId: primary,
      rows: [{ mateId: ama, position: 0, removedAt: new Date("2026-11-16T11:00:00.000Z") }],
      sentAt: sent,
    });
    expect(plan.revive.map((row) => row.mateId)).toEqual([ama]);
    expect(plan.insert).toEqual([]);
  });

  it("treats a removal newer than the message as blocking the attach write", () => {
    const sent = new Date("2026-11-16T12:00:00.000Z");
    expect(mayApplyAttach(new Date("2026-11-16T12:00:05.000Z"), sent)).toBe(false);
    expect(mayApplyAttach(new Date("2026-11-16T11:00:00.000Z"), sent)).toBe(true);
    expect(mayApplyAttach(null, sent)).toBe(true);
    expect(mayApplyAttach(sent, null)).toBe(false);
  });
});
