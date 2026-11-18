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
import { financeLatency } from "../src/usage/finance.js";

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

const fromDay = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
const toDay = new Date().toISOString().slice(0, 10);
const latency = await financeLatency(fromDay, toDay) as {
  cohort: string; runs: number; device_samples: number;
  setup_p50_ms: number | null; setup_p95_ms: number | null;
  token_p50_ms: number | null; token_p95_ms: number | null;
  text_p50_ms: number | null; text_p95_ms: number | null;
  done_p50_ms: number | null; done_p95_ms: number | null;
  device_p50_ms: number | null; device_p95_ms: number | null;
}[];
const pair = (p50: number | null, p95: number | null) => p50 === null || p95 === null ? "—" : `${Math.round(p50)}/${Math.round(p95)} ms`;
console.log(`Chat latency, p50/p95, ${fromDay} to ${toDay} (completed runs)`);
for (const row of latency) {
  console.log(`${row.cohort.padEnd(10)} runs ${String(row.runs).padStart(5)}  setup ${pair(row.setup_p50_ms, row.setup_p95_ms).padStart(15)}  token ${pair(row.token_p50_ms, row.token_p95_ms).padStart(15)}  saved text ${pair(row.text_p50_ms, row.text_p95_ms).padStart(15)}  done ${pair(row.done_p50_ms, row.done_p95_ms).padStart(15)}  phone ${pair(row.device_p50_ms, row.device_p95_ms).padStart(15)} (${row.device_samples} samples)`);
}
if (!latency.length) console.log("No completed chat samples yet. Apply the run_timings migration before collecting them.");
