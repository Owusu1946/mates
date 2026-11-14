import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { planGrants, profiles, type GrantKind } from "../db/schema.js";
import type { PlanId } from "./plans.js";

/**
 * Plan grants: every reason someone has a plan (set by us, the existing-user grace period, a store
 * subscription), one row per kind. The plan in force is the best active grant, cached on the
 * profile (profiles.plan) so every reader keeps reading one column. No active grant means the
 * server's DEFAULT_PLAN, so losing a subscription never leaves someone worse off than the default.
 */

const RANK: Record<PlanId, number> = { none: 0, starter: 1, plus: 2, pro: 3, max: 4 };

export type Grant = { kind: GrantKind; plan: PlanId; expiresAt: Date | null };

/** The best active grant, and when the plan next needs working out again (the soonest expiry among active grants). */
export function effectivePlan(grants: Grant[], now = new Date()) {
  const active = grants.filter((g) => g.plan !== "none" && (!g.expiresAt || g.expiresAt.getTime() > now.getTime()));
  const best = active.reduce<Grant | null>((top, g) => (!top || RANK[g.plan] > RANK[top.plan] ? g : top), null);
  const expiries = active.map((g) => g.expiresAt?.getTime()).filter((t): t is number => t !== undefined);
  return {
    plan: best?.plan ?? null,
    source: best?.kind ?? null,
    // A lower grant expiring changes nothing now, but checking then is cheap and keeps this simple.
    recheckAt: expiries.length ? new Date(Math.min(...expiries)) : null,
  };
}

/** Works out the plan in force from someone's grants and writes it to their profile. */
export async function refreshPlan(userId: string, now = new Date()) {
  const grants = await getDb().select({ kind: planGrants.kind, plan: planGrants.plan, expiresAt: planGrants.expiresAt }).from(planGrants).where(eq(planGrants.clerkUserId, userId));
  const result = effectivePlan(grants, now);
  await getDb()
    .insert(profiles)
    .values({ clerkUserId: userId, plan: result.plan, planSource: result.source, planExpiresAt: result.recheckAt })
    .onConflictDoUpdate({ target: profiles.clerkUserId, set: { plan: result.plan, planSource: result.source, planExpiresAt: result.recheckAt, updatedAt: now } });
  return result;
}

/** Gives (or replaces) one kind of grant, then refreshes the plan in force. */
export async function grant(userId: string, kind: GrantKind, plan: PlanId, extra: { expiresAt?: Date | null; environment?: "production" | "sandbox" | null; productId?: string | null; store?: string | null } = {}) {
  const values = { plan, expiresAt: extra.expiresAt ?? null, environment: extra.environment ?? null, productId: extra.productId ?? null, store: extra.store ?? null, updatedAt: new Date() };
  await getDb().insert(planGrants).values({ clerkUserId: userId, kind, ...values }).onConflictDoUpdate({ target: [planGrants.clerkUserId, planGrants.kind], set: values });
  return refreshPlan(userId);
}

/** Takes one kind of grant away, then refreshes the plan in force. */
export async function revoke(userId: string, kind: GrantKind) {
  await getDb().delete(planGrants).where(and(eq(planGrants.clerkUserId, userId), eq(planGrants.kind, kind)));
  return refreshPlan(userId);
}

/**
 * A store grant from a RevenueCat sync. Applied only when the state it came from is newer than what
 * is stored, so a late webhook or a slow client sync can never write older state over newer.
 * `plan: null` means no active subscription: the store grant goes, and the others decide.
 */
export async function applyStoreGrant(userId: string, state: { plan: PlanId | null; expiresAt: Date | null; environment: "production" | "sandbox" | null; productId: string | null; store: string | null; syncedAt: Date }) {
  const [current] = await getDb().select({ syncedAt: planGrants.syncedAt }).from(planGrants).where(and(eq(planGrants.clerkUserId, userId), eq(planGrants.kind, "revenuecat")));
  if (current?.syncedAt && current.syncedAt.getTime() > state.syncedAt.getTime()) return { applied: false as const };
  if (!state.plan) {
    await getDb().delete(planGrants).where(and(eq(planGrants.clerkUserId, userId), eq(planGrants.kind, "revenuecat"), sql`coalesce(${planGrants.syncedAt}, 'epoch') <= ${state.syncedAt}`));
  } else {
    const values = { plan: state.plan, expiresAt: state.expiresAt, environment: state.environment, productId: state.productId, store: state.store, syncedAt: state.syncedAt, updatedAt: new Date() };
    await getDb()
      .insert(planGrants)
      .values({ clerkUserId: userId, kind: "revenuecat", ...values })
      // Checked again in the write itself: a newer sync landing in between still wins.
      .onConflictDoUpdate({ target: [planGrants.clerkUserId, planGrants.kind], set: values, setWhere: sql`coalesce(${planGrants.syncedAt}, 'epoch') <= ${state.syncedAt}` });
  }
  return { applied: true as const, ...(await refreshPlan(userId)) };
}

/** The dispatcher's share: profiles whose winning grant (or another active one) has lapsed get their plan worked out again. */
export async function expireGrants(now = new Date()) {
  const due = await getDb().select({ userId: profiles.clerkUserId }).from(profiles).where(and(isNotNull(profiles.planExpiresAt), lte(profiles.planExpiresAt, now))).limit(200);
  for (const { userId } of due) await refreshPlan(userId, now).catch((error) => console.warn("plan_refresh_failed", { userId, message: error instanceof Error ? error.message : String(error) }));
  return due.length;
}
