import { createClerkClient } from "@clerk/backend";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db/client.js";
import {
  agentRuns,
  attachments,
  browserSessions,
  chats,
  codeRuns,
  delegations,
  deviceTokens,
  findings,
  githubInstallations,
  integrationSessions,
  mates,
  memories,
  missions,
  profiles,
  recallEntries,
  reminders,
  routines,
  undoActions,
} from "./db/schema.js";
import { getEnv } from "./env.js";
import { githubConfigured, uninstallAll } from "./github.js";
import { getComposio } from "./integrations.js";

/**
 * Every table holding a user's rows, in a delete order that satisfies foreign keys: routines
 * before the delegations their occurrences point at; chats before mates. Rows in tables without
 * an owner column (messages, outbox, events, deliveries, members, notes) cascade from these.
 */
export const ACCOUNT_TABLES = [
  codeRuns,
  routines,
  delegations,
  findings,
  browserSessions,
  agentRuns,
  recallEntries,
  attachments,
  memories,
  reminders,
  undoActions,
  deviceTokens,
  missions,
  chats,
  mates,
  integrationSessions,
  githubInstallations,
  profiles,
] as const;

/** Disconnects every app the user linked, so no third-party access outlives the account. */
async function disconnectAllApps(userId: string) {
  if (!process.env.COMPOSIO_API_KEY) return;
  const composio = getComposio();
  // Re-list after each pass rather than paging: deleting shifts any cursor.
  for (let pass = 0; pass < 10; pass++) {
    const accounts = await composio.connectedAccounts.list({ userIds: [userId] });
    if (!accounts.items.length) return;
    for (const account of accounts.items) await composio.connectedAccounts.delete(account.id);
  }
  throw new Error("Some apps could not be disconnected.");
}

/**
 * Permanently deletes a user: stops their work, disconnects their apps, removes all their data,
 * then the sign-in itself. Data goes before the sign-in, so a failure part-way can be retried by
 * signing in again; the reverse would strand data nobody can reach.
 */
export async function deleteAccount(userId: string) {
  const db = getDb();
  await db
    .update(delegations)
    .set({ cancelRequested: true })
    .where(and(eq(delegations.clerkUserId, userId), inArray(delegations.status, ["queued", "running"])));
  await disconnectAllApps(userId);
  // The mates' bot leaves every GitHub account it was installed on.
  if (githubConfigured()) await uninstallAll(userId);
  const [first, ...rest] = ACCOUNT_TABLES.map((table) => db.delete(table).where(eq(table.clerkUserId, userId)));
  await db.batch([first!, ...rest]);
  await createClerkClient({ secretKey: getEnv().CLERK_SECRET_KEY }).users.deleteUser(userId);
}
