import { timingSafeEqual } from "node:crypto";
import { getDb } from "../db/client.js";
import { planPeriods, profiles } from "../db/schema.js";
import { planSpec, type PlanId } from "./plans.js";

/** Where "See plans" goes until in-app purchases exist. */
export const upgradeUrl = () => process.env.UPGRADE_URL ?? "https://agents.askorin.app/#pricing";

/**
 * Puts someone on a plan. With `period`, also records what they paid for it (list price by default,
 * or the store's real amounts), so revenue and margins can be worked out. The store's webhook will
 * call this too, with its transaction id as `externalId` so a replayed event records nothing twice.
 */
export async function setPlan(
  userId: string,
  plan: PlanId,
  options: { source?: "manual" | "revenuecat"; period?: { startsAt?: Date; endsAt?: Date; grossMicros?: number; storeFeeMicros?: number; externalId?: string } } = {},
) {
  const source = options.source ?? "manual";
  const db = getDb();
  await db
    .insert(profiles)
    .values({ clerkUserId: userId, plan, planSource: source })
    .onConflictDoUpdate({ target: profiles.clerkUserId, set: { plan, planSource: source, updatedAt: new Date() } });
  if (!options.period || plan === "none") return;
  const startsAt = options.period.startsAt ?? new Date();
  const endsAt = options.period.endsAt ?? new Date(new Date(startsAt).setUTCMonth(startsAt.getUTCMonth() + 1));
  await db
    .insert(planPeriods)
    .values({
      clerkUserId: userId,
      plan,
      startsAt,
      endsAt,
      grossMicros: options.period.grossMicros ?? planSpec(plan).priceMicros,
      storeFeeMicros: options.period.storeFeeMicros ?? 0,
      source,
      externalId: options.period.externalId ?? null,
    })
    .onConflictDoNothing();
}

/** The admin key for /internal routes. Unset means those routes are closed. */
export function adminAuthorized(header: string | undefined) {
  const key = process.env.ADMIN_API_KEY;
  if (!key || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}
