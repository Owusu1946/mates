/**
 * Checks what we metered against what providers bill, for a month.
 *   pnpm exec tsx scripts/reconcile-costs.ts [YYYY-MM, default this month]
 * OpenRouter: our metered cost on the main key against the key's own spend this month (code runs
 * use their own short-lived keys and are listed apart). Everything priced from src/usage/prices.ts
 * is listed per provider, to hold against each provider's invoice; if they drift, fix the price and
 * bump PRICE_VERSION.
 */
import "../src/load-env.js";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";

const month = /^\d{4}-\d{2}$/.test(process.argv[2] ?? "") ? process.argv[2]! : new Date().toISOString().slice(0, 7);
const rows = async <T>(query: ReturnType<typeof sql>) => ((await getDb().execute(query)) as unknown as { rows: T[] }).rows;
const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

const metered = await rows<{ provider: string; estimated: boolean; code: boolean; cost: string; events: string }>(sql`
  SELECT provider, estimated, source = 'code' AND provider = 'openrouter' AS code, sum(cost_micros) AS cost, count(*) AS events
  FROM usage_events WHERE to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') = ${month}
  GROUP BY 1, 2, 3 ORDER BY 1`);

console.log(`\nMetered for ${month}\n`);
for (const row of metered)
  console.log(`${row.provider.padEnd(12)} ${row.code ? "code-run keys" : row.estimated ? "estimated   " : "reported    "} ${usd(Number(row.cost)).padStart(10)}   ${row.events} events`);

const mainKey = metered.filter((r) => r.provider === "openrouter" && !r.code).reduce((sum, r) => sum + Number(r.cost), 0);
if (process.env.OPENROUTER_API_KEY && month === new Date().toISOString().slice(0, 7)) {
  const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } });
  const body = (await response.json().catch(() => null)) as { data?: { usage_monthly?: number } } | null;
  const billed = body?.data?.usage_monthly;
  if (typeof billed === "number") {
    const drift = billed > 0 ? ((mainKey / 1_000_000 - billed) / billed) * 100 : 0;
    console.log(`\nOpenRouter main key this month: billed $${billed.toFixed(2)}, metered ${usd(mainKey)} (${drift >= 0 ? "+" : ""}${drift.toFixed(1)}%).`);
    console.log("Some drift is expected: work run without a person (scripts, smoke tests) isn't metered to anyone.");
  } else console.log("\nOpenRouter didn't report this month's key spend; compare with the activity page instead.");
} else console.log("\nCompare the OpenRouter line with the activity page for that month.");
console.log("Hold the estimated lines against each provider's invoice; adjust src/usage/prices.ts and bump PRICE_VERSION if they drift.\n");
