/**
 * The existing-user grace period: every account that exists now gets Starter until a date, as a
 * "grandfather" grant beside anything else they have. Run once, when paid enforcement starts, before
 * switching DEFAULT_PLAN=none and USAGE_ENFORCE=on (see docs/plans/in-app-purchase-progress.md).
 *   pnpm exec tsx scripts/grandfather.ts --until 2026-12-31T23:59:59Z [--dry-run]
 * Safe to run again: it only ever moves an account's grace period later, never earlier.
 */
import "../src/load-env.js";
import { createClerkClient } from "@clerk/backend";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { planGrants } from "../src/db/schema.js";
import { getEnv } from "../src/env.js";
import { refreshPlan } from "../src/usage/grants.js";

const args = process.argv.slice(2);
const until = new Date(args[args.indexOf("--until") + 1] ?? "");
const dryRun = args.includes("--dry-run");
if (!args.includes("--until") || Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
  console.error("Usage: tsx scripts/grandfather.ts --until <future ISO date> [--dry-run]");
  process.exit(1);
}

// Every account, from Clerk (the source of truth for who has signed up), a page at a time.
const clerk = createClerkClient({ secretKey: getEnv().CLERK_SECRET_KEY });
const ids: string[] = [];
for (let offset = 0; ; offset += 500) {
  const { data } = await clerk.users.getUserList({ limit: 500, offset, orderBy: "created_at" });
  ids.push(...data.map((u) => u.id));
  if (data.length < 500) break;
}

console.log(`${ids.length} account(s) get Starter until ${until.toISOString()}${dryRun ? " (dry run: nothing written)" : ""}.`);
if (dryRun) process.exit(0);

let done = 0;
for (const userId of ids) {
  await getDb()
    .insert(planGrants)
    .values({ clerkUserId: userId, kind: "grandfather", plan: "starter", expiresAt: until })
    .onConflictDoUpdate({ target: [planGrants.clerkUserId, planGrants.kind], set: { plan: "starter", expiresAt: sql`greatest(${planGrants.expiresAt}, ${until})`, updatedAt: new Date() } });
  await refreshPlan(userId);
  if (++done % 100 === 0) console.log(`  ${done}/${ids.length}`);
}
console.log(`Done: ${done} account(s).`);
