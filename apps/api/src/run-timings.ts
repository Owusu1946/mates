import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { delegations, runTimings } from "./db/schema.js";

type Stage = "setupDoneAt" | "firstTokenAt" | "firstTextAt" | "doneAt";

export function hasVisibleText(content: Record<string, unknown>[]) {
  return content.some((part) => part.type === "text" && typeof part.text === "string" && part.text.trim().length > 0);
}

/** Routine runs bypass the chat submission route, so create their timing row when claimed. */
export async function ensureRunTiming(id: string, submittedAt: Date) {
  await getDb().insert(runTimings).values({ delegationId: id, submittedAt }).onConflictDoNothing();
}

/** The first observation wins, including when a run is retried or a model has several steps. */
export async function markRunTiming(id: string, stage: Stage) {
  await getDb().update(runTimings).set({ [stage]: new Date() }).where(and(eq(runTimings.delegationId, id), isNull(runTimings[stage])));
}

export async function markToolStep(id: string) {
  await getDb().update(runTimings).set({ toolSteps: sql`${runTimings.toolSteps} + 1` }).where(eq(runTimings.delegationId, id));
}

/** The mobile client sends elapsed monotonic time, avoiding phone/server clock skew. */
export async function recordClientFirstText(userId: string, id: string, elapsedMs: number) {
  const [owned] = await getDb().select({ id: delegations.id }).from(delegations).where(and(eq(delegations.id, id), eq(delegations.clerkUserId, userId)));
  if (!owned) return false;
  await getDb().update(runTimings).set({ clientFirstTextMs: elapsedMs }).where(and(eq(runTimings.delegationId, id), isNull(runTimings.clientFirstTextMs)));
  return true;
}
