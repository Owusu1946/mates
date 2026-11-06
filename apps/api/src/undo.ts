import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { undoActions } from "./db/schema.js";
import { getComposio } from "./integrations.js";

const UNDO_WINDOW_MS = 24 * 3_600_000;

export async function saveUndo(userId: string, sessionId: string, inverse: { tool_slug: string; arguments: Record<string, unknown> }) {
  const [row] = await getDb()
    .insert(undoActions)
    .values({ clerkUserId: userId, sessionId, toolSlug: inverse.tool_slug, arguments: inverse.arguments, expiresAt: new Date(Date.now() + UNDO_WINDOW_MS) })
    .returning({ id: undoActions.id });
  return row!.id;
}

/**
 * Runs a stored inverse once. The client only names the undo; what runs was decided when the
 * action happened, under the same account.
 */
export async function runUndo(userId: string, id: string): Promise<"done" | "not_found" | "failed"> {
  if (!z.string().uuid().safeParse(id).success) return "not_found";
  const [row] = await getDb()
    .update(undoActions)
    .set({ status: "done" })
    .where(and(eq(undoActions.id, id), eq(undoActions.clerkUserId, userId), eq(undoActions.status, "available"), gt(undoActions.expiresAt, new Date())))
    .returning();
  if (!row) return "not_found";
  try {
    const session = await getComposio().use(row.sessionId);
    const output = JSON.parse(
      await getComposio().provider.executeToolCall(session, {
        id: `undo_${randomUUID()}`,
        type: "function",
        function: { name: "COMPOSIO_MULTI_EXECUTE_TOOL", arguments: JSON.stringify({ tools: [{ tool_slug: row.toolSlug, arguments: row.arguments }], thought: "Undo", sync_response_to_workbench: false }) },
      }),
    ) as { successful?: boolean; error?: unknown; data?: { results?: { error?: unknown }[] } };
    const failed = output.successful === false || !!output.error || output.data?.results?.some((r) => r.error);
    if (failed) throw new Error("Undo failed");
    return "done";
  } catch {
    await getDb().update(undoActions).set({ status: "failed" }).where(eq(undoActions.id, id));
    return "failed";
  }
}
