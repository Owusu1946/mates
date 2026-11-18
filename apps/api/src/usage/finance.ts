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

export type LatencyRow = {
  cohort: "no_tool" | "with_tool";
  runs: number;
  device_samples: number;
  queue_p50_ms: number | null;
  queue_p95_ms: number | null;
  setup_p50_ms: number | null;
  setup_p95_ms: number | null;
  token_p50_ms: number | null;
  token_p95_ms: number | null;
  text_p50_ms: number | null;
  text_p95_ms: number | null;
  done_p50_ms: number | null;
  done_p95_ms: number | null;
  device_p50_ms: number | null;
  device_p95_ms: number | null;
};

/** Completed chat runs only; tool and plain turns have very different latency profiles. */
export async function financeLatency(fromDay: string, toDay: string) {
  return rows<LatencyRow>(sql`
    SELECT CASE WHEN t.tool_steps = 0 THEN 'no_tool' ELSE 'with_tool' END AS cohort,
      count(*)::integer AS runs,
      count(t.client_first_text_ms)::integer AS device_samples,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.started_at - t.submitted_at) * 1000) AS queue_p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM t.started_at - t.submitted_at) * 1000) AS queue_p95_ms,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.setup_done_at - t.started_at) * 1000) AS setup_p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM t.setup_done_at - t.started_at) * 1000) AS setup_p95_ms,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.first_token_at - t.submitted_at) * 1000) AS token_p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM t.first_token_at - t.submitted_at) * 1000) AS token_p95_ms,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.first_text_at - t.submitted_at) * 1000) AS text_p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM t.first_text_at - t.submitted_at) * 1000) AS text_p95_ms,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.done_at - t.submitted_at) * 1000) AS done_p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM t.done_at - t.submitted_at) * 1000) AS done_p95_ms,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY t.client_first_text_ms) AS device_p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY t.client_first_text_ms) AS device_p95_ms
    FROM run_timings t
    JOIN delegations d ON d.id = t.delegation_id
    JOIN chats c ON c.id = d.chat_id
    WHERE t.submitted_at >= ${fromDay}::date
      AND t.submitted_at < (${toDay}::date + interval '1 day')
      AND d.status = 'completed'
      AND c.kind IN ('mate', 'legacy')
      AND d.request->>'resumeRunId' IS NULL
      AND d.request_key !~ '^(occurrence_|watch_|habit_|call_|manual_|mission_)'
    GROUP BY 1 ORDER BY 1`);
}
