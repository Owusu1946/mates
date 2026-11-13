/**
 * Puts someone on a plan by hand, until payments do it.
 *   pnpm exec tsx scripts/set-plan.ts <email or user id> <starter|plus|pro|max|none> [--no-payment]
 * Records a month at the plan's list price as revenue, unless --no-payment (for comped accounts).
 */
import "../src/load-env.js";
import { createClerkClient } from "@clerk/backend";
import { getEnv } from "../src/env.js";
import { setPlan } from "../src/usage/billing.js";
import { usageState } from "../src/usage/gate.js";
import { isPlanId } from "../src/usage/plans.js";

const [who, plan, flag] = process.argv.slice(2);
if (!who || !isPlanId(plan)) {
  console.error("Usage: tsx scripts/set-plan.ts <email or user id> <starter|plus|pro|max|none> [--no-payment]");
  process.exit(1);
}

let userId = who;
if (who.includes("@")) {
  const clerk = createClerkClient({ secretKey: getEnv().CLERK_SECRET_KEY });
  const { data } = await clerk.users.getUserList({ emailAddress: [who] });
  if (!data[0]) {
    console.error(`No account with ${who}.`);
    process.exit(1);
  }
  userId = data[0].id;
}

await setPlan(userId, plan, { period: flag === "--no-payment" ? undefined : {} });
const state = await usageState(userId);
console.log(`${userId} is now on ${state.plan.label}.`, JSON.stringify(state.windows));
