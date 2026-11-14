import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { activityEvents, profiles } from "../db/schema.js";
import { getComposio } from "../integrations.js";
import { recordActivity } from "./activity.js";
import { onActivityEvent } from "./nudges.js";
import { syncPreps, PREP_PLANS } from "./prep.js";
import { learningFor } from "./shared.js";

/**
 * "Learn from my apps": one broad Composio trigger per app, created only when the user turns it
 * on (Plus and up), and removed when they turn it off. Mail you send and calendar changes come in
 * on the same webhook as app watches; only metadata is kept (who it went to, never the content).
 */

type Observer = { toolkit: string; slug: string; triggerId: string };

/** What each app is watched for: the trigger is picked from the app's real list by name. */
const OBSERVED: { toolkit: string; pick: RegExp; config: Record<string, unknown> }[] = [
  { toolkit: "gmail", pick: /^GMAIL_NEW_GMAIL_MESSAGE$|^GMAIL_NEW_MESSAGE/, config: { labelIds: "SENT", userId: "me", interval: 5 } },
  { toolkit: "googlecalendar", pick: /^GOOGLECALENDAR_.*EVENT.*(CREATED|CHANGE|UPDATED)/, config: { calendarId: "primary" } },
];

async function observersOf(userId: string): Promise<Observer[]> {
  const [profile] = await getDb().select({ observerTriggers: profiles.observerTriggers }).from(profiles).where(eq(profiles.clerkUserId, userId));
  return profile?.observerTriggers ?? [];
}

/** Turns learning from apps on: a trigger for each connected app that has one. Apps not connected are skipped. */
export async function startObserving(userId: string) {
  const existing = await observersOf(userId);
  const created: Observer[] = [...existing];
  for (const app of OBSERVED) {
    if (existing.some((o) => o.toolkit === app.toolkit)) continue;
    try {
      const { items } = await getComposio().triggers.listTypes({ toolkits: [app.toolkit], limit: 50 });
      const type = items.find((t) => app.pick.test(t.slug));
      if (!type) continue;
      const { triggerId } = await getComposio().triggers.create(userId, type.slug, { triggerConfig: app.config });
      created.push({ toolkit: app.toolkit, slug: type.slug, triggerId });
    } catch (error) {
      // Usually "not connected": that app is simply not learned from.
      console.warn("observer_create_skipped", { toolkit: app.toolkit, message: error instanceof Error ? error.message : String(error) });
    }
  }
  await getDb().update(profiles).set({ observerTriggers: created }).where(eq(profiles.clerkUserId, userId));
  return created.map((o) => o.toolkit);
}

/** Turns it off: every observer trigger goes, and what came from apps is forgotten. */
export async function stopObserving(userId: string) {
  for (const observer of await observersOf(userId))
    await getComposio().triggers.delete(observer.triggerId).catch((error: unknown) => console.warn("observer_delete_failed", { triggerId: observer.triggerId, message: error instanceof Error ? error.message : String(error) }));
  await getDb().update(profiles).set({ observerTriggers: [] }).where(eq(profiles.clerkUserId, userId));
  await getDb().delete(activityEvents).where(and(eq(activityEvents.clerkUserId, userId), eq(activityEvents.kind, "app_event")));
}

const CONSUMER_MAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|proton|protonmail|aol)\./;

/** "email_acme" for someone at acme.com; "email_ama" for ama@gmail.com. Never the message itself. */
export function mailTaskKey(address: string) {
  const email = address.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]?.toLowerCase();
  if (!email) return null;
  const [local, domain] = email.split("@") as [string, string];
  const who = CONSUMER_MAIL.test(domain) ? local.split(/[.+]/)[0]! : domain.split(".").at(-2) ?? domain;
  return `email_${who.replace(/[^a-z0-9]/g, "").slice(0, 30)}`;
}

/**
 * An event on the Composio webhook that no watch owned: if it's one of the user's observers, it's
 * logged as metadata, follow-up habits are offered, and calendar changes refresh meeting prep.
 */
export async function recordAppEvent(event: { triggerId: string; eventId: string; slug: string; payload: Record<string, unknown> }) {
  const [owner] = await getDb()
    .select({ clerkUserId: profiles.clerkUserId, plan: profiles.plan })
    .from(profiles)
    .where(sql`${profiles.observerTriggers} @> ${JSON.stringify([{ triggerId: event.triggerId }])}::jsonb`);
  if (!owner) return { handled: false };
  const learning = await learningFor(owner.clerkUserId);
  // A redelivered event is logged once.
  const [seen] = await getDb().select({ id: activityEvents.id }).from(activityEvents).where(and(eq(activityEvents.clerkUserId, owner.clerkUserId), eq(activityEvents.ref, event.eventId))).limit(1);
  if (seen) return { handled: true };

  if (event.slug.startsWith("GMAIL_")) {
    if (!learning.apps) return { handled: true };
    const to = String(event.payload.to ?? event.payload.recipient ?? (event.payload.preview as { to?: string } | undefined)?.to ?? "");
    const taskKey = mailTaskKey(to);
    if (!taskKey) return { handled: true };
    await recordActivity([{ userId: owner.clerkUserId, kind: "app_event", toolkit: "gmail", slug: "GMAIL_SENT", taskKey, label: `Emailed ${taskKey.slice(6)}`, ref: event.eventId }]);
    await onActivityEvent(owner.clerkUserId, "app_event", "GMAIL_SENT", event.eventId);
  } else if (event.slug.startsWith("GOOGLECALENDAR_")) {
    if (learning.prep && PREP_PLANS.includes(owner.plan ?? "")) await syncPreps(owner.clerkUserId);
  }
  return { handled: true };
}
