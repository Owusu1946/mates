import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { chatMessages, chats, delegations, messageFeedback, usageEvents } from "./db/schema.js";

const feedbackReasonSchema = z.enum([
  "wrong_answer",
  "didnt_follow_instructions",
  "too_slow",
  "too_long",
  "other",
]);

export const messageFeedbackInputSchema = z.object({
  rating: z.enum(["up", "down"]),
  reason: feedbackReasonSchema.optional(),
  note: z.string().trim().max(1_000).optional(),
}).superRefine((value, context) => {
  if (value.rating === "down" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Choose a reason for negative feedback." });
  }
  if (value.rating === "up" && (value.reason || value.note)) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Positive feedback cannot include a negative reason or note." });
  }
});

type MessageFeedbackInput = z.infer<typeof messageFeedbackInputSchema>;
type FeedbackResult =
  | { ok: true; rating: "up" | "down"; reason: MessageFeedbackInput["reason"] | null }
  | { ok: false; error: "NOT_FOUND" | "MESSAGE_NOT_READY" };

function messageDelegationId(message: Record<string, unknown>) {
  const metadata = message.metadata as { custom?: { delegationId?: unknown } } | undefined;
  const value = metadata?.custom?.delegationId;
  return typeof value === "string" && z.string().uuid().safeParse(value).success ? value : null;
}

function singleSpeakerId(message: Record<string, unknown>) {
  if (!Array.isArray(message.content)) return null;
  const speakerIds = new Set<string>();
  for (const part of message.content) {
    if (!part || typeof part !== "object") continue;
    const result = (part as { result?: unknown }).result;
    if (!result || typeof result !== "object") continue;
    const card = result as { kind?: unknown; speaker?: { id?: unknown } };
    if (card.kind === "speaker" && typeof card.speaker?.id === "string") speakerIds.add(card.speaker.id);
  }
  return speakerIds.size === 1 ? [...speakerIds][0]! : null;
}

export function messageFeedbackAttribution(message: Record<string, unknown>, chatKind: string, chatMateId: string | null) {
  return {
    runId: messageDelegationId(message),
    mateId: chatKind === "group" ? singleSpeakerId(message) : chatMateId,
  };
}

export function isMessageFeedbackReady(message: Record<string, unknown>, runStatus?: string) {
  const status = message.status as { type?: unknown } | undefined;
  return status?.type !== "running" && !(runStatus && ["queued", "running"].includes(runStatus));
}

export async function saveMessageFeedback(userId: string, messageId: string, input: MessageFeedbackInput): Promise<FeedbackResult> {
  const [saved] = await getDb()
    .select({ chatId: chatMessages.chatId, chatKind: chats.kind, chatMateId: chats.mateId, message: chatMessages.message })
    .from(chatMessages)
    .innerJoin(chats, eq(chats.id, chatMessages.chatId))
    .where(and(eq(chatMessages.id, messageId), eq(chats.clerkUserId, userId)))
    .limit(1);
  if (!saved || saved.message.role !== "assistant") return { ok: false, error: "NOT_FOUND" };

  const message = saved.message;
  if (!isMessageFeedbackReady(message)) return { ok: false, error: "MESSAGE_NOT_READY" };

  const attribution = messageFeedbackAttribution(message, saved.chatKind, saved.chatMateId);
  const candidateRunId = attribution.runId;
  const [run] = candidateRunId
    ? await getDb()
        .select({ id: delegations.id, status: delegations.status })
        .from(delegations)
        .where(and(eq(delegations.id, candidateRunId), eq(delegations.clerkUserId, userId), eq(delegations.chatId, saved.chatId)))
        .limit(1)
    : [];
  if (!isMessageFeedbackReady(message, run?.status)) return { ok: false, error: "MESSAGE_NOT_READY" };

  const runId = run?.id ?? null;
  const [modelRow] = runId
    ? await getDb()
        .select({ model: usageEvents.model })
        .from(usageEvents)
        .where(and(eq(usageEvents.clerkUserId, userId), eq(usageEvents.provider, "openrouter"), eq(usageEvents.ref, runId)))
        .orderBy(desc(usageEvents.createdAt))
        .limit(1)
    : [];
  const mateId = attribution.mateId;
  const reason = input.rating === "down" ? input.reason! : null;
  const note = input.rating === "down" ? input.note?.trim() || null : null;

  await getDb()
    .insert(messageFeedback)
    .values({
      clerkUserId: userId,
      chatId: saved.chatId,
      messageId,
      mateId,
      runId,
      model: modelRow?.model || null,
      rating: input.rating,
      reason,
      note,
    })
    .onConflictDoUpdate({
      target: [messageFeedback.clerkUserId, messageFeedback.messageId],
      set: { mateId, runId, model: modelRow?.model || null, rating: input.rating, reason, note, createdAt: new Date() },
    });

  return { ok: true, rating: input.rating, reason };
}

export async function deleteMessageFeedback(userId: string, messageId: string) {
  const deleted = await getDb()
    .delete(messageFeedback)
    .where(and(eq(messageFeedback.clerkUserId, userId), eq(messageFeedback.messageId, messageId)))
    .returning({ id: messageFeedback.id });
  return deleted.length > 0;
}

export async function listRecentNegativeFeedback(days: number) {
  return getDb()
    .select({
      createdAt: messageFeedback.createdAt,
      chatId: messageFeedback.chatId,
      messageId: messageFeedback.messageId,
      mateId: messageFeedback.mateId,
      runId: messageFeedback.runId,
      model: messageFeedback.model,
      reason: messageFeedback.reason,
      note: messageFeedback.note,
    })
    .from(messageFeedback)
    .where(and(eq(messageFeedback.rating, "down"), gte(messageFeedback.createdAt, new Date(Date.now() - days * 86_400_000))))
    .orderBy(desc(messageFeedback.createdAt));
}
