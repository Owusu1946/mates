import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import type { UsageProvider, UsageSource } from "../db/schema.js";
import { defaultPlan } from "./plans.js";
import { PRICE_VERSION } from "./prices.js";

export type UsageInput = {
  userId: string;
  source: UsageSource;
  provider: UsageProvider;
  costMicros: number;
  model?: string | null;
  ref?: string | null;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  seconds?: number;
  /** True when priced from our table (src/usage/prices.ts) rather than reported by the provider. */
  estimated?: boolean;
  /** Same key, same charge: a retried step or worker can record again without charging twice. */
  key?: string;
};

const whole = (value: number | undefined) => (Number.isFinite(value) && value! > 0 ? Math.round(value!) : 0);

/**
 * Charges one cost to the ledger, both usage windows and the daily totals in a single statement, so
 * they can never disagree. A window that has run out starts afresh with this cost. Never throws: a
 * metering failure is logged and retried once, and must not break the work it measured.
 */
export async function recordUsage(input: UsageInput): Promise<void> {
  const costMicros = whole(input.costMicros);
  if (!input.userId) return;
  const key = input.key ?? randomUUID();
  const values = {
    model: input.model ?? "",
    inputTokens: whole(input.inputTokens),
    cachedTokens: whole(input.cachedTokens),
    outputTokens: whole(input.outputTokens),
    seconds: whole(input.seconds),
  };
  const statement = sql`
    WITH event AS (
      INSERT INTO usage_events (clerk_user_id, source, provider, model, plan, ref, cost_micros, input_tokens, cached_tokens, output_tokens, seconds, estimated, price_version, idempotency_key)
      VALUES (
        ${input.userId}, ${input.source}, ${input.provider}, ${values.model},
        COALESCE((SELECT plan FROM profiles WHERE clerk_user_id = ${input.userId}), ${defaultPlan()}),
        ${input.ref ?? null}, ${costMicros}, ${values.inputTokens}, ${values.cachedTokens}, ${values.outputTokens}, ${values.seconds},
        ${input.estimated ?? false}, ${input.estimated ? PRICE_VERSION : null}, ${key}
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING clerk_user_id, plan, source, provider, model, cost_micros, input_tokens, cached_tokens, output_tokens, seconds
    ),
    windows AS (
      INSERT INTO usage_windows (clerk_user_id, kind, started_at, resets_at, spent_micros)
      SELECT event.clerk_user_id, w.kind, now(), now() + w.length, event.cost_micros
      FROM event CROSS JOIN (VALUES ('5h', interval '5 hours'), ('week', interval '7 days')) AS w(kind, length)
      ON CONFLICT (clerk_user_id, kind) DO UPDATE SET
        started_at = CASE WHEN usage_windows.resets_at <= now() THEN now() ELSE usage_windows.started_at END,
        resets_at = CASE WHEN usage_windows.resets_at <= now() THEN EXCLUDED.resets_at ELSE usage_windows.resets_at END,
        spent_micros = CASE WHEN usage_windows.resets_at <= now() THEN EXCLUDED.spent_micros ELSE usage_windows.spent_micros + EXCLUDED.spent_micros END
      RETURNING 1
    ),
    daily AS (
      INSERT INTO usage_daily (day, clerk_user_id, plan, source, provider, model, cost_micros, input_tokens, cached_tokens, output_tokens, seconds, events)
      SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'), clerk_user_id, plan, source, provider, model, cost_micros, input_tokens, cached_tokens, output_tokens, seconds, 1
      FROM event
      ON CONFLICT (day, clerk_user_id, plan, source, provider, model) DO UPDATE SET
        cost_micros = usage_daily.cost_micros + EXCLUDED.cost_micros,
        input_tokens = usage_daily.input_tokens + EXCLUDED.input_tokens,
        cached_tokens = usage_daily.cached_tokens + EXCLUDED.cached_tokens,
        output_tokens = usage_daily.output_tokens + EXCLUDED.output_tokens,
        seconds = usage_daily.seconds + EXCLUDED.seconds,
        events = usage_daily.events + 1
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM windows) AS windows, (SELECT count(*) FROM daily) AS daily`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await getDb().execute(statement);
      return;
    } catch (error) {
      if (attempt === 1)
        console.warn("usage_record_failed", { userId: input.userId, source: input.source, costMicros, message: error instanceof Error ? error.message : String(error) });
    }
  }
}

/** Dollars (as providers report them) to whole micro-dollars. */
export const usdToMicros = (usd: number | null | undefined) => (typeof usd === "number" && Number.isFinite(usd) && usd > 0 ? Math.round(usd * 1_000_000) : 0);
