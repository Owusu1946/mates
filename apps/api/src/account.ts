import { randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db/client.js";
import {
  agentRuns,
  attachments,
  browserSessions,
  calls,
  chats,
  codeRuns,
  computerGoals,
  computers,
  decks,
  pages,
  delegations,
  deviceTokens,
  findings,
  friendInvites,
  friends,
  mateRequests,
  githubInstallations,
  integrationSessions,
  mates,
  memories,
  mateNotificationSettings,
  proactiveNotifications,
  messageFeedback,
  missions,
  profiles,
  recallEntries,
  reminders,
  routines,
  morningBriefSettings,
  morningBriefs,
  slackLinks,
  slackQueue,
  slackRuns,
  undoActions,
  actionGrants,
  planPeriods,
  usageDaily,
  usageEvents,
  usageWindows,
  watches,
  habitNudges,
  habits,
  interests,
  activityEvents,
  meetingPreps,
  planGrants,
  billingEvents,
} from "./db/schema.js";
import { deleteComputerFor } from "./computers.js";
import { deleteFriendRowsAbout } from "./friends.js";
import { deleteRequestsTo } from "./mate-requests.js";
import { getEnv } from "./env.js";
import { githubConfigured, uninstallAll } from "./github.js";
import { getComposio } from "./integrations.js";
import { deleteWatchTriggers } from "./watches.js";
import { stopObserving } from "./habits/observers.js";

/**
 * Every table holding a user's rows, in a delete order that satisfies foreign keys: routines
 * before the delegations their occurrences point at; chats before mates. Rows in tables without
 * an owner column (messages, outbox, events, deliveries, members, notes, deck versions) cascade from these.
 */
export const ACCOUNT_TABLES = [
  codeRuns,
  // Goals before the computer they ran on; the desktop itself is deleted at Daytona first.
  computerGoals,
  computers,
  // Their versions cascade.
  decks,
  pages,
  routines,
  morningBriefSettings,
  morningBriefs,
  // Slack: their runs and links go; the workspace's install stays for its other members.
  slackRuns,
  slackQueue,
  slackLinks,
  delegations,
  findings,
  friendInvites,
  friends,
  mateRequests,
  browserSessions,
  agentRuns,
  recallEntries,
  attachments,
  memories,
  reminders,
  undoActions,
  actionGrants,
  deviceTokens,
  missions,
  calls,
  messageFeedback,
  chats,
  mateNotificationSettings,
  proactiveNotifications,
  mates,
  integrationSessions,
  githubInstallations,
  usageWindows,
  // Their events cascade.
  watches,
  // Habits: what mates learned, before the profile holding the switches.
  habitNudges,
  habits,
  interests,
  activityEvents,
  meetingPreps,
  // Billing: their plan grants and the store events about them (the revenue ledger is kept, anonymised).
  planGrants,
  billingEvents,
  profiles,
] as const;

/**
 * The money ledgers: what someone cost us and paid us. They outlive the account, since the months
 * they belong to still have to add up, but are cut loose from the person: the user id becomes a
 * random one that leads nowhere.
 */
export const ACCOUNT_LEDGERS = [usageEvents, usageDaily, planPeriods] as const;

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
  // App watches' Composio triggers stop before the account goes.
  await deleteWatchTriggers(userId).catch(() => undefined);
  // So do the "learn from my apps" observers.
  await stopObserving(userId).catch(() => undefined);
  // Their desktop and its disk (logins, files) go too; a failure here stops the deletion so it can be retried.
  await deleteComputerFor(userId);
  // Friends: other people's rows about them (their own go with the tables below).
  await deleteFriendRowsAbout(userId);
  await deleteRequestsTo(userId);
  const anonymous = `deleted_${randomUUID()}`;
  const [first, ...rest] = [
    ...ACCOUNT_LEDGERS.map((table) => db.update(table).set({ clerkUserId: anonymous }).where(eq(table.clerkUserId, userId))),
    ...ACCOUNT_TABLES.map((table) => db.delete(table).where(eq(table.clerkUserId, userId))),
  ];
  await db.batch([first!, ...rest]);
  await createClerkClient({ secretKey: getEnv().CLERK_SECRET_KEY }).users.deleteUser(userId);
}
