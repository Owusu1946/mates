import { timingSafeEqual } from "node:crypto";
import { getDb } from "../db/client.js";
import { planPeriods } from "../db/schema.js";
import { grant, revoke } from "./grants.js";
import { planSpec, type PlanId } from "./plans.js";

/** Where "See plans" goes until in-app purchases exist. */
export const upgradeUrl = () => process.env.UPGRADE_URL ?? "https://agents.askorin.app/#pricing";

/**
 * Puts someone on a plan by hand (the /internal route): a manual grant, which stays alongside any
 * subscription or grace period; the best of them is the plan in force. "none" takes the manual
 * grant away. With `period`, also records what they paid (list price by default, or real amounts),
 * so revenue and margins can be worked out; `externalId` makes a replay record nothing twice.
 */
export async function setPlan(
  userId: string,
  plan: PlanId,
  options: { source?: "manual" | "revenuecat"; period?: { startsAt?: Date; endsAt?: Date; grossMicros?: number; storeFeeMicros?: number; externalId?: string } } = {},
) {
  const source = options.source ?? "manual";
  // Store subscriptions arrive through RevenueCat's sync (applyStoreGrant); here only the ledger.
  if (source === "manual") await (plan === "none" ? revoke(userId, "manual") : grant(userId, "manual", plan));
  if (!options.period || plan === "none") return;
  await recordPeriod(userId, plan, source, options.period);
}

/** One paid period in the revenue ledger (plan_periods); refunds are negative amounts. */
export async function recordPeriod(userId: string, plan: PlanId, source: "manual" | "revenuecat", period: { startsAt?: Date; endsAt?: Date; grossMicros?: number; storeFeeMicros?: number; externalId?: string }) {
  const db = getDb();
  const startsAt = period.startsAt ?? new Date();
  const endsAt = period.endsAt ?? new Date(new Date(startsAt).setUTCMonth(startsAt.getUTCMonth() + 1));
  await db
    .insert(planPeriods)
    .values({
      clerkUserId: userId,
      plan,
      startsAt,
      endsAt,
      grossMicros: period.grossMicros ?? planSpec(plan).priceMicros,
      storeFeeMicros: period.storeFeeMicros ?? 0,
      source,
      externalId: period.externalId ?? null,
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
