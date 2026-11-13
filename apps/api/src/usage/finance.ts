import { sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { usageState } from "./gate.js";

/**
 * Read-only queries behind the admin dashboard's /internal/finance routes. Every amount is in
 * micro-dollars (divide by 1,000,000 for dollars); the SQL views they read are in migration 0027.
 */

const rows = async <T>(query: ReturnType<typeof sql>) => ((await getDb().execute(query)) as unknown as { rows: T[] }).rows;

export const GROUPS = { source: "source", provider: "provider", model: "model", plan: "plan", user: "clerk_user_id", day: "day" } as const;
export type CostGroup = keyof typeof GROUPS;

/** Months as YYYY-MM, days as YYYY-MM-DD; both inclusive. */
export async function financeSummary(fromMonth: string, toMonth: string) {
  const [months, plans] = await Promise.all([
    rows(sql`SELECT * FROM v_profit_month WHERE month BETWEEN ${fromMonth} AND ${toMonth} ORDER BY month`),
    rows(sql`SELECT * FROM v_plan_margin WHERE month BETWEEN ${fromMonth} AND ${toMonth} ORDER BY month, plan`),
  ]);
  return { months, plans };
}

export async function financeCosts(fromDay: string, toDay: string, groupBy: CostGroup) {
  const column = sql.raw(GROUPS[groupBy]);
  return rows(sql`
    SELECT ${column} AS key,
      sum(cost_micros)::bigint AS cost_micros,
      sum(input_tokens)::bigint AS input_tokens,
      sum(cached_tokens)::bigint AS cached_tokens,
      sum(output_tokens)::bigint AS output_tokens,
      sum(seconds)::bigint AS seconds,
      sum(events)::bigint AS events,
      count(DISTINCT clerk_user_id) AS users
    FROM usage_daily
    WHERE day BETWEEN ${fromDay} AND ${toDay}
    GROUP BY 1
    ORDER BY cost_micros DESC
    LIMIT 500`);
}

export async function financeUser(userId: string) {
  const [months, recent, usage] = await Promise.all([
    rows(sql`SELECT * FROM v_user_margin WHERE clerk_user_id = ${userId} ORDER BY month DESC LIMIT 24`),
    rows(sql`SELECT day, source, provider, model, cost_micros, events FROM usage_daily WHERE clerk_user_id = ${userId} ORDER BY day DESC, cost_micros DESC LIMIT 200`),
    usageState(userId),
  ]);
  return { months, recent, usage };
}
