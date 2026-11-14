import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { billingEvents } from "../db/schema.js";
import { recordPeriod } from "./billing.js";
import { applyStoreGrant } from "./grants.js";
import type { PlanId } from "./plans.js";

/**
 * RevenueCat: store subscriptions become a plan grant, and what people pay becomes the revenue
 * ledger. RevenueCat is the source of truth for subscriptions; every sync reads its current state
 * rather than trusting an event, so delayed or out-of-order events can't apply stale data.
 */

const PAID: Exclude<PlanId, "none">[] = ["max", "pro", "plus", "starter"];
const RANK: Record<PlanId, number> = { none: 0, starter: 1, plus: 2, pro: 3, max: 4 };

/**
 * Which plan a store product is: the app's products (`mates_<plan>_<monthly|yearly>`, and the Test
 * Store's `mates_starter_annual`) and RevenueCat promotional grants (`rc_promo_<plan>_<duration>`).
 * Anything else is unknown, and unknown products never grant or take away access.
 */
export function productPlan(productId: string | null | undefined): Exclude<PlanId, "none"> | null {
  const match = /^(?:mates_(starter|plus|pro|max)_(?:monthly|yearly|annual)|rc_promo_(starter|plus|pro|max)_.+)$/.exec(productId ?? "");
  return (match?.[1] ?? match?.[2] ?? null) as Exclude<PlanId, "none"> | null;
}

export class BillingUnavailable extends Error {}

export function revenueCatAuthorized(header: string | undefined): boolean {
  const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!secret || !header) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const allowSandbox = () => process.env.REVENUECAT_ALLOW_SANDBOX === "true";

const date = z.string().nullable().optional();
const subscriberSchema = z.object({
  request_date_ms: z.number(),
  subscriber: z.object({
    entitlements: z.record(z.string(), z.object({ product_identifier: z.string(), expires_date: date, grace_period_expires_date: date })).default({}),
    subscriptions: z
      .record(z.string(), z.object({ expires_date: date, grace_period_expires_date: date, is_sandbox: z.boolean().optional(), refunded_at: date, store: z.string().nullable().optional() }))
      .default({}),
  }),
});

export type StoreState = { plan: Exclude<PlanId, "none"> | null; expiresAt: Date | null; environment: "production" | "sandbox" | null; productId: string | null; store: string | null; syncedAt: Date };

/**
 * The best active subscription in a RevenueCat customer, judged per product, so a sandbox receipt
 * can't grant access on production or hide a real subscription. Refunded and lapsed ones don't
 * count; a billing grace period does. Promotional grants (no store receipt) count too.
 */
export function subscriberState(data: unknown, sandboxAllowed: boolean, now = Date.now()): StoreState {
  const { request_date_ms, subscriber } = subscriberSchema.parse(data);
  type Candidate = Omit<StoreState, "syncedAt" | "plan"> & { plan: Exclude<PlanId, "none"> };
  const candidates: Candidate[] = [];
  const active = (expiry: string | null | undefined) => {
    if (expiry === null || expiry === undefined) return { ok: true, at: null };
    const at = Date.parse(expiry);
    return { ok: Number.isFinite(at) && at > now, at: Number.isFinite(at) ? new Date(at) : null };
  };
  for (const [productId, sub] of Object.entries(subscriber.subscriptions)) {
    const plan = productPlan(productId);
    if (!plan) {
      console.warn("revenuecat_unknown_product", { productId });
      continue;
    }
    if (sub.is_sandbox && !sandboxAllowed) continue;
    if (sub.refunded_at) continue;
    const until = active(sub.grace_period_expires_date ?? sub.expires_date);
    if (until.ok) candidates.push({ plan, expiresAt: until.at, environment: sub.is_sandbox ? "sandbox" : "production", productId, store: sub.store ?? null });
  }
  // Promotional entitlements granted in the dashboard may have no receipt of their own.
  for (const plan of PAID) {
    const entitlement = subscriber.entitlements[plan];
    if (!entitlement?.product_identifier.startsWith("rc_promo_") || subscriber.subscriptions[entitlement.product_identifier]) continue;
    const until = active(entitlement.grace_period_expires_date ?? entitlement.expires_date);
    if (until.ok) candidates.push({ plan, expiresAt: until.at, environment: null, productId: entitlement.product_identifier, store: "promotional" });
  }
  const best = candidates.reduce<Candidate | null>((top, c) => (!top || RANK[c.plan] > RANK[top.plan] ? c : top), null);
  return { ...(best ?? { plan: null, expiresAt: null, environment: null, productId: null, store: null }), syncedAt: new Date(request_date_ms) };
}

/** Reads the customer from RevenueCat and applies it as their store grant. Fails before writing anything if RevenueCat can't be read. */
export async function syncFromRevenueCat(userId: string) {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new BillingUnavailable("RevenueCat isn't configured");
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`RevenueCat subscriber request failed (${response.status})`);
  const state = subscriberState(await response.json(), allowSandbox());
  return { state, ...(await applyStoreGrant(userId, state)) };
}

// ---- Webhook events ---------------------------------------------------------------------------

const num = z.number().nullable().optional();
const eventSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    environment: z.enum(["SANDBOX", "PRODUCTION"]).optional(),
    app_user_id: z.string().optional(),
    original_app_user_id: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    transferred_from: z.array(z.string()).optional(),
    transferred_to: z.array(z.string()).optional(),
    product_id: z.string().nullable().optional(),
    transaction_id: z.string().nullable().optional(),
    price: num,
    commission_percentage: num,
    tax_percentage: num,
    purchased_at_ms: num,
    expiration_at_ms: num,
  })
  .passthrough();
export type BillingEvent = z.infer<typeof eventSchema>;
export const revenueCatWebhookSchema = z.object({ event: eventSchema });

const isUser = (id: unknown): id is string => typeof id === "string" && id.startsWith("user_");

/** Everyone an event is about: both sides of a transfer, otherwise the customer and their aliases. */
export function eventUsers(event: BillingEvent) {
  const ids = event.type === "TRANSFER" ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])] : [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  return [...new Set(ids.filter(isUser))];
}

/** Keeps an event (once, by its id) and starts processing it; the dispatcher retries anything left over. */
export async function storeEvent(event: BillingEvent) {
  const inserted = await getDb()
    .insert(billingEvents)
    .values({ id: event.id, clerkUserId: eventUsers(event)[0] ?? null, type: event.type, environment: event.environment ?? null, payload: event as Record<string, unknown> })
    .onConflictDoNothing()
    .returning({ id: billingEvents.id });
  if (inserted.length) void processBillingEvent(event.id).catch(() => undefined);
  return { stored: inserted.length > 0 };
}

const PAYING = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "NON_RENEWING_PURCHASE"]);

/**
 * What an event paid, as a ledger row, or null when it records nothing. Production only. A negative
 * price (a refund or reversal) is recorded as RevenueCat sends it, never negated again, under its
 * own id so it sits beside the original payment. Fees use the current commission and tax fields.
 */
export function eventPeriod(event: BillingEvent) {
  if (event.environment !== "PRODUCTION") return null;
  const refund = typeof event.price === "number" && event.price < 0;
  if (!refund && !PAYING.has(event.type)) return null;
  const userId = [event.app_user_id, event.original_app_user_id].find(isUser);
  const plan = productPlan(event.product_id);
  if (!userId || !plan || typeof event.price !== "number" || !event.transaction_id) {
    console.warn("revenuecat_event_unrecorded", { id: event.id, type: event.type });
    return null;
  }
  const gross = Math.round(event.price * 1_000_000);
  const share = (event.commission_percentage ?? 0) + (event.tax_percentage ?? 0);
  const startsAt = event.purchased_at_ms ? new Date(event.purchased_at_ms) : new Date();
  const endsAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : startsAt;
  return {
    userId,
    plan,
    period: { startsAt, endsAt, grossMicros: gross, storeFeeMicros: Math.round(gross * share), externalId: refund ? `refund_${event.transaction_id}` : event.transaction_id },
  };
}

/**
 * Processes one stored event: syncs everyone it names from RevenueCat's current state, then records
 * what it paid. Claimed first (attempts + 1, stamped), so it isn't run twice at once.
 */
export async function processBillingEvent(id: string) {
  const [claimed] = await getDb()
    .update(billingEvents)
    .set({ attempts: sql`${billingEvents.attempts} + 1`, processedAt: new Date() })
    .where(and(eq(billingEvents.id, id), inArray(billingEvents.status, ["pending", "failed"]), or(isNull(billingEvents.processedAt), lt(billingEvents.processedAt, new Date(Date.now() - 30_000)), eq(billingEvents.attempts, 0))))
    .returning();
  if (!claimed) return;
  const event = eventSchema.parse(claimed.payload);
  try {
    // Sandbox events only count on a staging API; on production they're kept and closed.
    if (event.type !== "TEST" && (event.environment !== "SANDBOX" || allowSandbox())) {
      for (const userId of eventUsers(event)) await syncFromRevenueCat(userId);
      const paid = eventPeriod(event);
      if (paid) await recordPeriod(paid.userId, paid.plan, "revenuecat", paid.period);
    }
    await getDb().update(billingEvents).set({ status: "done", error: null, processedAt: new Date() }).where(eq(billingEvents.id, id));
  } catch (error) {
    await getDb().update(billingEvents).set({ status: "failed", error: (error instanceof Error ? error.message : String(error)).slice(0, 500), processedAt: new Date() }).where(eq(billingEvents.id, id));
  }
}

const MAX_ATTEMPTS = 8;

/** The dispatcher's share: events never processed, and failed ones after a growing wait (up to 8 tries). */
export async function processBillingEvents(now = new Date()) {
  const due = (await getDb().execute(sql`
    SELECT id FROM billing_events
    WHERE (status = 'pending' AND (processed_at IS NULL OR processed_at < ${new Date(now.getTime() - 60_000)}))
       OR (status = 'failed' AND attempts < ${MAX_ATTEMPTS} AND processed_at < ${now}::timestamptz - make_interval(mins => attempts * attempts))
    ORDER BY received_at LIMIT 25`)) as unknown as { rows: { id: string }[] };
  for (const { id } of due.rows) await processBillingEvent(id);
  return due.rows.length;
}
