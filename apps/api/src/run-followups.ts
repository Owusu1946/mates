import { and, eq, inArray, isNull } from "drizzle-orm";
import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import { getDb } from "./db/client.js";
import { chatMessages, delegations, runEvents } from "./db/schema.js";
import { createChatStore } from "./chats.js";
import { extractMemories, memoryCard, memorySettings } from "./memory.js";
import { recordRunActivity } from "./habits/activity.js";
import { recordExchange } from "./recall.js";
import { deliverFindings } from "./delivery.js";
import { deliverSlack } from "./slack-delivery.js";
import type { postRunChores } from "./trigger/agent.js";

export async function enqueueRunFollowups(delegationId: string) {
  const [run] = await getDb().select({ userId: delegations.clerkUserId, status: delegations.status, queuedAt: delegations.followupsQueuedAt }).from(delegations).where(eq(delegations.id, delegationId));
  if (!run || run.queuedAt || !["completed", "failed", "waiting", "cancelled"].includes(run.status)) return;
  const idempotencyKey = await idempotencyKeys.create(`cooper-post-run:${delegationId}`, { scope: "global" });
  await tasks.trigger<typeof postRunChores>("cooper-post-run", { delegationId, userId: run.userId }, {
    idempotencyKey,
    idempotencyKeyTTL: "30d",
    concurrencyKey: run.userId,
    ttl: "1h",
  });
  // Mark only after Trigger accepts the task. If this write fails, the stable key returns the same task on sweep retry.
  await getDb().update(delegations).set({ followupsQueuedAt: new Date() }).where(and(eq(delegations.id, delegationId), isNull(delegations.followupsQueuedAt)));
}

export async function enqueuePendingRunFollowups() {
  const pending = await getDb().select({ id: delegations.id }).from(delegations)
    .where(and(inArray(delegations.status, ["completed", "failed", "waiting", "cancelled"]), isNull(delegations.followupsQueuedAt)))
    .limit(50);
  for (const run of pending) {
    await enqueueRunFollowups(run.id).catch(error => console.warn("post_run_enqueue_failed", { id: run.id, message: error instanceof Error ? error.message : String(error) }));
  }
}

export async function processRunFollowups(delegationId: string, userId: string) {
  const [run] = await getDb().select().from(delegations).where(and(eq(delegations.id, delegationId), eq(delegations.clerkUserId, userId)));
  if (!run || !["completed", "failed", "waiting", "cancelled"].includes(run.status)) return;

  if (run.status === "completed") {
    const request = run.request as { messages?: { role: string; content: string }[]; mission?: unknown; resumeRunId?: string };
    const last = request.messages?.at(-1);
    if (last?.role === "user" && !request.mission) {
      const content = structuredClone(run.content);
      const assistantText = content.filter(part => part.type === "text").map(part => String(part.text ?? "")).join("\n");
      const settings = await memorySettings(userId).catch(() => null);
      if (settings?.memoryEnabled) {
        if (settings.historyRecall)
          await recordExchange({ delegationId, userId, chatId: run.chatId, userText: last.content, assistantText }).catch(() => console.warn("recall_index_failed", { id: delegationId }));
        if (!run.chatId?.startsWith("routine_")) {
          try {
            const mateId = run.chatId?.startsWith("mate_") ? run.chatId.slice(5) : null;
            const changes = await extractMemories({ userId, chatId: run.chatId, userText: last.content, assistantText, mateId });
            if (changes.length) {
              for (const change of changes) {
                const id = `memory_${delegationId}_${change.id}`;
                const part = { type: "tool-call", toolCallId: id, toolName: "cooper_workflow", args: {}, argsText: "{}", result: memoryCard(change) };
                const index = content.findIndex(item => item.type === "tool-call" && item.toolCallId === id);
                if (index >= 0) content[index] = part;
                else content.push(part);
              }
              await appendMemoryUpdate(run, content);
            }
          } catch {
            console.warn("memory_extraction_failed", { id: delegationId });
          }
        }
      }

      if (!/^(occurrence|watch|habit|manual)_/.test(run.requestKey)) {
        await recordRunActivity({
          userId,
          runId: delegationId,
          agentRunId: run.agentRunId,
          chatId: run.chatId,
          mateId: run.chatId?.startsWith("mate_") ? run.chatId.slice(5) : null,
          userText: last.content,
          timezone: (run.request as { timezone?: string | null }).timezone,
        }).catch(() => console.warn("run_activity_failed", { id: delegationId }));
      }
    }
  }

  await deliverFindings().catch(() => console.warn("finding_delivery_failed"));
  await deliverSlack().catch(() => console.warn("slack_delivery_failed"));
}

async function appendMemoryUpdate(run: typeof delegations.$inferSelect, content: Record<string, unknown>[]) {
  const sequence = run.sequence + 1;
  const createdAt = new Date(run.createdAt.getTime() + 1).toISOString();
  const message = {
    id: run.assistantMessageId,
    role: "assistant",
    createdAt,
    content: structuredClone(content),
    metadata: { custom: { delegationId: run.id, resumed: !!(run.request as { resumeRunId?: string }).resumeRunId } },
    status: "complete",
  };
  const statements = [
    getDb().update(delegations).set({ content: structuredClone(content), sequence, updatedAt: new Date() }).where(and(eq(delegations.id, run.id), eq(delegations.status, "completed"))),
    getDb().insert(runEvents).values({ delegationId: run.id, sequence, type: "memory.updated", payload: { content: structuredClone(content), status: "completed" } }).onConflictDoNothing(),
  ] as const;
  if (run.chatId && await createChatStore().get(run.clerkUserId, run.chatId)) {
    await getDb().batch([...statements, getDb().insert(chatMessages).values({ chatId: run.chatId, id: run.assistantMessageId, parentId: run.parentId, message, createdAt: new Date(createdAt) }).onConflictDoUpdate({ target: [chatMessages.chatId, chatMessages.id], set: { message } })]);
  } else {
    await getDb().batch([...statements]);
  }
}
