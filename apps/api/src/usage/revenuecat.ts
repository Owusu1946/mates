import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { setPlan } from "./billing.js";
import type { PlanId } from "./plans.js";

const paidPlans = ["max", "pro", "plus", "starter"] as const;

// RevenueCat's v1 response combines production and sandbox purchases for a customer.
// Match an entitlement to its subscription before granting access in production.
const subscriberSchema = z.object({
  subscriber: z.object({
    entitlements: z.record(z.string(), z.object({
      product_identifier: z.string(),
      expires_date: z.string().nullable(),
      grace_period_expires_date: z.string().nullable().optional(),
    })),
    subscriptions: z.record(z.string(), z.object({ is_sandbox: z.boolean() })),
  }),
});

export function revenueCatAuthorized(header: string | undefined): boolean {
  const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!secret || !header) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function subscriberPlan(data: unknown, allowSandbox: boolean, now = Date.now()): PlanId {
  const { subscriber } = subscriberSchema.parse(data);
  for (const plan of paidPlans) {
    const entitlement = subscriber.entitlements[plan];
    if (!entitlement) continue;
    const subscription = subscriber.subscriptions[entitlement.product_identifier];
    // Never treat an unrecognised product or missing environment as a production purchase.
    if (!subscription) throw new Error("RevenueCat entitlement has no matching subscription");
    if (subscription.is_sandbox && !allowSandbox) continue;
    const expiration = entitlement.grace_period_expires_date ?? entitlement.expires_date;
    if (expiration === null) return plan;
    const expiresAt = Date.parse(expiration);
    if (!Number.isFinite(expiresAt)) throw new Error("Invalid RevenueCat entitlement expiration");
    if (expiresAt > now) return plan;
  }
  return "none";
}

export async function syncFromRevenueCat(userId: string): Promise<PlanId> {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new Error("RevenueCat secret key is not configured");
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`RevenueCat subscriber request failed (${response.status})`);
  const plan = subscriberPlan(await response.json(), process.env.REVENUECAT_ALLOW_SANDBOX === "true");
  await setPlan(userId, plan, { source: "revenuecat" });
  return plan;
}

const eventSchema = z.object({
  type: z.string().min(1),
  environment: z.enum(["SANDBOX", "PRODUCTION"]).optional(),
  app_user_id: z.string().optional(),
  original_app_user_id: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  transferred_from: z.array(z.string()).optional(),
  transferred_to: z.array(z.string()).optional(),
});

export const revenueCatWebhookSchema = z.object({ event: eventSchema });

export async function handleRevenueCatEvent(event: z.infer<typeof eventSchema>): Promise<void> {
  if (event.type === "TEST") return;
  if (event.environment === "SANDBOX" && process.env.REVENUECAT_ALLOW_SANDBOX !== "true") return;
  const ids = event.type === "TRANSFER"
    ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
    : [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  const users = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.startsWith("user_")))];
  for (const userId of users) await syncFromRevenueCat(userId);
}
