/**
 * How much people really use, to check budgets and prices before limits are switched on.
 *   pnpm exec tsx scripts/usage-report.ts [days=7]
 * Per plan: weekly cost per person at the median, 90th percentile and max, against the budget, and
 * how many would have been stopped. Then where the money goes, by source and by model.
 */
import "../src/load-env.js";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { planSpec, type PlanId } from "../src/usage/plans.js";

const days = Math.max(1, Math.min(90, Number(process.argv[2] ?? 7) || 7));
const rows = async <T>(query: ReturnType<typeof sql>) => ((await getDb().execute(query)) as unknown as { rows: T[] }).rows;
const usd = (micros: number) => `$${(Number(micros) / 1_000_000).toFixed(micros < 10_000_000 ? 4 : 2)}`;
const since = sql`(now() - make_interval(days => ${days}))`;

const perUser = await rows<{ plan: PlanId; clerk_user_id: string; cost: string }>(sql`
  SELECT plan, clerk_user_id, sum(cost_micros) AS cost FROM usage_events WHERE created_at >= ${since} GROUP BY plan, clerk_user_id`);
const byPlan = new Map<PlanId, number[]>();
for (const row of perUser) byPlan.set(row.plan, [...(byPlan.get(row.plan) ?? []), (Number(row.cost) * 7) / days]);

console.log(`\nWeekly cost per person over the last ${days} day(s), against each plan's weekly budget\n`);
for (const [plan, costs] of byPlan) {
  costs.sort((a, b) => a - b);
  const at = (q: number) => costs[Math.min(costs.length - 1, Math.floor(q * costs.length))] ?? 0;
  const budget = planSpec(plan).budgets.week;
  const over = budget ? costs.filter((c) => c >= budget).length : 0;
  console.log(`${planSpec(plan).label.padEnd(8)} people ${String(costs.length).padStart(5)}   p50 ${usd(at(0.5)).padStart(9)}   p90 ${usd(at(0.9)).padStart(9)}   max ${usd(costs.at(-1) ?? 0).padStart(9)}   budget ${budget ? usd(budget) : "—"}   over budget ${over}`);
}

console.log(`\nWhere it goes (last ${days} day(s))\n`);
for (const row of await rows<{ source: string; provider: string; model: string; cost: string; events: string }>(sql`
  SELECT source, provider, model, sum(cost_micros) AS cost, count(*) AS events FROM usage_events WHERE created_at >= ${since}
  GROUP BY source, provider, model ORDER BY cost DESC LIMIT 25`))
  console.log(`${row.source.padEnd(11)} ${row.provider.padEnd(12)} ${(row.model || "—").padEnd(32)} ${usd(Number(row.cost)).padStart(10)}   ${row.events} events`);
console.log("\nWould-be blocks are logged by the API as usage_would_block while USAGE_ENFORCE=shadow.\n");
