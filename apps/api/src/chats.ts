import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { chats, chatMessages, delegations } from "./db/schema.js";
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
