import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { chats, chatCollaborators, chatMessages, delegations, mates } from "./db/schema.js";
import { enrichChats, ensureDefaultMate } from "./mates.js";

export const chatIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const chatMetadataSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(["regular", "archived"]).optional(),
});
export const chatCollaboratorsSchema = z.object({
  mateIds: z.array(z.string().uuid()).max(19),
});
export const savedMessageSchema = z.object({
  parentId: z.string().max(160).nullable(),
  message: z
    .object({
      id: chatIdSchema,
      role: z.enum(["user", "assistant", "system", "tool"]),
      createdAt: z.string().datetime(),
      content: z.array(z.record(z.string(), z.unknown())).max(200),
    })
    .passthrough(),
});
export const deletedMessagesSchema = z.object({
  ids: z.array(chatIdSchema).min(1).max(500),
});
export type SavedMessage = z.infer<typeof savedMessageSchema>;

export type CollaboratorRow = { mateId: string; position: number; removedAt: Date | null };

/** Which mentions to persist. A removal newer than the message wins over this run. */
export function collaboratorAttachPlan(input: {
  requestedIds: string[];
  primaryId: string;
  rows: CollaboratorRow[];
  sentAt: Date | null;
  cap?: number;
}) {
  const cap = input.cap ?? 19;
  const requested = [...new Set(input.requestedIds)].filter((mateId) => mateId !== input.primaryId);
  const byId = new Map(input.rows.map((row) => [row.mateId, row]));
  let room = Math.max(0, cap - input.rows.filter((row) => row.removedAt === null).length);
  let position = input.rows.reduce((max, row) => Math.max(max, row.position), -1) + 1;
  const insert: { mateId: string; position: number }[] = [];
  const revive: { mateId: string; position: number }[] = [];
  for (const mateId of requested) {
    const row = byId.get(mateId);
    if (row && row.removedAt === null) continue;
    if (row?.removedAt && (input.sentAt === null || row.removedAt > input.sentAt)) continue;
    if (room <= 0) continue;
    room -= 1;
    (row ? revive : insert).push({ mateId, position: position++ });
  }
  return { insert, revive };
}

/** Whether an attach write may still clear or skip a removal, using the row's current timestamp rather than the one read earlier. */
export function mayApplyAttach(currentRemovedAt: Date | null, sentAt: Date | null) {
  if (currentRemovedAt === null) return true;
  return sentAt !== null && currentRemovedAt.getTime() <= sentAt.getTime();
}

/** The newest leaf, not the newest row: rows saved with a skewed clock can sort a reply before its question. */
export function headOf(nodes: { id: string; parentId: string | null }[]) {
  const parents = new Set(nodes.map((node) => node.parentId));
  const leaves = nodes.filter((node) => !parents.has(node.id));
  return (leaves.at(-1) ?? nodes.at(-1))?.id ?? null;
}

/**
 * Which messages make up one page of a chat, newest first. A page is the last `limit` messages on
 * the current branch, plus every branch that splits off inside that span, so the branch picker
 * still works for what's on screen: everything below the page's top message's parent. With
 * `before` (the oldest message the app has), it's the span above that, without what the app already
 * holds. `nodes` are in saved order.
 */
export function historyPageIds(nodes: { id: string; parentId: string | null }[], options: { limit: number; before?: string | null }) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string | null, string[]>();
  for (const node of nodes) {
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const below = (top: string | null) => {
    const out = new Set<string>();
    const pending = [...(children.get(top) ?? [])];
    while (pending.length) {
      const id = pending.pop()!;
      if (out.has(id)) continue;
      out.add(id);
      pending.push(...(children.get(id) ?? []));
    }
    return out;
  };
  const headId = headOf(nodes);
  let start: string | null;
  if (options.before) {
    const oldest = byId.get(options.before);
    start = oldest?.parentId ?? null;
    if (!oldest || !start || !byId.has(start)) return { ids: new Set<string>(), hasMore: false, headId };
  } else {
    start = headId;
  }
  let top: string | null = null;
  for (let id = start, n = 0; id && n < options.limit; n++) {
    top = id;
    id = byId.get(id)?.parentId ?? null;
  }
  const topParent = top ? byId.get(top)?.parentId ?? null : null;
  const span = topParent && byId.has(topParent) ? below(topParent) : new Set(nodes.map((node) => node.id));
  if (options.before) for (const id of below(start)) span.delete(id);
  return { ids: span, hasMore: !!topParent && byId.has(topParent), headId };
}

export function createChatStore() {
  const owned = (userId: string, id: string) =>
    and(eq(chats.id, id), eq(chats.clerkUserId, userId));
  return {
    /** Every chat with its mate or members and newest message; Cooper always exists. */
    async list(userId: string) {
      await ensureDefaultMate(userId);
      const rows = await getDb()
        .select()
        .from(chats)
        .where(eq(chats.clerkUserId, userId))
        .orderBy(desc(chats.updatedAt));
      return enrichChats(userId, rows);
    },
    async get(
      userId: string,
      id: string,
    ): Promise<typeof chats.$inferSelect | null> {
      return (
        (
          await getDb().select().from(chats).where(owned(userId, id)).limit(1)
        )[0] ?? null
      );
    },
    async initialize(
      userId: string,
      id: string,
      kind: "legacy" | "routine" = "legacy",
      speakerMateId: string | null = null,
    ): Promise<typeof chats.$inferSelect | null> {
      await getDb()
        .insert(chats)
        .values({ id, clerkUserId: userId, kind, leaderMateId: speakerMateId })
        .onConflictDoNothing();
      return this.get(userId, id);
    },
    async update(
      userId: string,
      id: string,
      values: z.infer<typeof chatMetadataSchema>,
    ): Promise<typeof chats.$inferSelect | null> {
      return (
        (
          await getDb()
            .update(chats)
            .set({ ...values, updatedAt: new Date() })
            .where(owned(userId, id))
            .returning()
        )[0] ?? null
      );
    },
    async setCollaborators(userId: string, id: string, requestedMateIds: string[]) {
      const chat = await this.get(userId, id);
      if (!chat || chat.kind !== "mate" || !chat.mateId) return { ok: false as const, reason: "NOT_FOUND" as const };

      const mateIds = [...new Set(requestedMateIds)];
      if (mateIds.includes(chat.mateId)) return { ok: false as const, reason: "INVALID_MATES" as const };
      if (mateIds.length) {
        const ownedMates = await getDb().select({ id: mates.id }).from(mates)
          .where(and(eq(mates.clerkUserId, userId), inArray(mates.id, mateIds)));
        if (ownedMates.length !== mateIds.length) return { ok: false as const, reason: "INVALID_MATES" as const };
      }

      const allOwnedMates = await getDb().select({ id: mates.id }).from(mates).where(eq(mates.clerkUserId, userId));
      const removedMateIds = allOwnedMates.map((mate) => mate.id).filter((mateId) => mateId !== chat.mateId && !mateIds.includes(mateId));
      const writes = [
        ...(removedMateIds.length ? [getDb().insert(chatCollaborators).values(removedMateIds.map((mateId) => ({ chatId: id, mateId, removedAt: sql`now()` }))).onConflictDoNothing()] : []),
        getDb().update(chatCollaborators).set({ removedAt: sql`now()` }).where(eq(chatCollaborators.chatId, id)),
        ...(mateIds.length
          ? [getDb().insert(chatCollaborators).values(mateIds.map((mateId, position) => ({ chatId: id, mateId, position, removedAt: null }))).onConflictDoUpdate({
              target: [chatCollaborators.chatId, chatCollaborators.mateId],
              set: { removedAt: null, position: sql`excluded.position` },
            })]
          : []),
      ];
      await getDb().batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);
      return { ok: true as const, mateIds };
    },
    /** Adds owned mates to a direct chat without removing the ones already attached. */
    async attachCollaborators(userId: string, id: string, requestedMateIds: string[], sentAt: Date | null = null) {
      const chat = await this.get(userId, id);
      if (!chat || chat.kind !== "mate" || !chat.mateId) return { ok: false as const, reason: "NOT_FOUND" as const };
      const mateIds = [...new Set(requestedMateIds)].filter((mateId) => mateId !== chat.mateId);
      if (!mateIds.length) return { ok: true as const, mateIds: [] as string[] };
      const ownedMates = await getDb().select({ id: mates.id }).from(mates)
        .where(and(eq(mates.clerkUserId, userId), inArray(mates.id, mateIds)));
      if (ownedMates.length !== mateIds.length) return { ok: false as const, reason: "INVALID_MATES" as const };
      const existing = await getDb().select({ mateId: chatCollaborators.mateId, position: chatCollaborators.position, removedAt: chatCollaborators.removedAt }).from(chatCollaborators).where(eq(chatCollaborators.chatId, id));
      const plan = collaboratorAttachPlan({ requestedIds: mateIds, primaryId: chat.mateId, rows: existing, sentAt });
      // The guard re-checks removed_at in the write. A removal that landed after the read does not match, so it is not cleared.
      const stillYours = sentAt
        ? or(isNull(chatCollaborators.removedAt), lte(chatCollaborators.removedAt, sentAt))
        : isNull(chatCollaborators.removedAt);
      const writes = [
        ...plan.revive.map((row) => getDb().update(chatCollaborators).set({ removedAt: null, position: row.position }).where(and(eq(chatCollaborators.chatId, id), eq(chatCollaborators.mateId, row.mateId), stillYours))),
        ...(plan.insert.length ? [getDb().insert(chatCollaborators).values(plan.insert.map((row) => ({ chatId: id, mateId: row.mateId, position: row.position }))).onConflictDoNothing()] : []),
      ];
      if (writes.length) await getDb().batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);
      return { ok: true as const, mateIds: [...plan.insert, ...plan.revive].map((row) => row.mateId) };
    },
    async delete(userId: string, id: string) {
      return (
        (
          await getDb()
            .delete(chats)
            .where(owned(userId, id))
            .returning({ id: chats.id })
        ).length > 0
      );
    },
    async history(userId: string, id: string) {
      if (!(await this.get(userId, id))) return null;
      const rows = await getDb()
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.chatId, id))
        .orderBy(chatMessages.createdAt, chatMessages.id);
      return rows.map((row) => ({
        parentId: row.parentId,
        message: row.message,
      }));
    },
    /**
     * One page of a chat (see historyPageIds): the ids and parents are read first, which is cheap,
     * then only the page's messages in full.
     */
    async historyPage(userId: string, id: string, options: { limit: number; before?: string | null }) {
      if (!(await this.get(userId, id))) return null;
      const nodes = await getDb()
        .select({ id: chatMessages.id, parentId: chatMessages.parentId })
        .from(chatMessages)
        .where(eq(chatMessages.chatId, id))
        .orderBy(chatMessages.createdAt, chatMessages.id);
      const page = historyPageIds(nodes, options);
      const ids = [...page.ids];
      const rows = ids.length
        ? await getDb().select().from(chatMessages).where(and(eq(chatMessages.chatId, id), inArray(chatMessages.id, ids))).orderBy(chatMessages.createdAt, chatMessages.id)
        : [];
      return { messages: rows.map((row) => ({ parentId: row.parentId, message: row.message })), hasMore: page.hasMore, headId: page.headId };
    },
    async save(userId: string, id: string, item: SavedMessage) {
      if (!(await this.get(userId, id))) return false;
      if (item.message.role === "assistant" && process.env.COOPER_BACKGROUND_ENABLED === "true") {
        const [serverOwned] = await getDb().select({ id: delegations.id }).from(delegations).where(and(eq(delegations.chatId, id), eq(delegations.assistantMessageId, item.message.id), eq(delegations.clerkUserId, userId))).limit(1);
        if (serverOwned) return true; // A disconnected client's stale snapshot cannot overwrite worker output.
      }
      const text =
        item.message.role === "user"
          ? item.message.content
              .filter(
                (part) => part.type === "text" && typeof part.text === "string",
              )
              .map((part) => part.text)
              .join(" ")
              .trim()
          : "";
      const initialTitle =
        text.length > 42 ? `${text.slice(0, 42).trimEnd()}…` : text;
      // Both statements commit together: a message and the drawer's updated time.
      await getDb().batch([
        getDb()
          .insert(chatMessages)
          .values({
            chatId: id,
            id: item.message.id,
            parentId: item.parentId,
            message: item.message,
          })
          .onConflictDoUpdate({
            target: [chatMessages.chatId, chatMessages.id],
            set: { parentId: item.parentId, message: item.message },
          }),
        getDb()
          .update(chats)
          .set({
            updatedAt: new Date(),
            ...(initialTitle
              ? {
                  title: sql`CASE WHEN ${chats.title} = 'New chat' THEN ${initialTitle} ELSE ${chats.title} END`,
                }
              : {}),
          })
          .where(owned(userId, id)),
      ]);
      return true;
    },
    async deleteMessages(userId: string, id: string, ids: string[]) {
      if (!(await this.get(userId, id))) return false;
      await getDb()
        .delete(chatMessages)
        .where(and(eq(chatMessages.chatId, id), inArray(chatMessages.id, ids)));
      return true;
    },
  };
}
export type ChatStore = ReturnType<typeof createChatStore>;
