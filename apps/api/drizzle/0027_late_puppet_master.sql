CREATE TABLE "fixed_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"vendor" text NOT NULL,
	"amount_micros" bigint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"plan" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"gross_micros" bigint NOT NULL,
	"store_fee_micros" bigint DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_periods_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"day" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"plan" text NOT NULL,
	"source" text NOT NULL,
	"provider" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"cached_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"seconds" bigint DEFAULT 0 NOT NULL,
	"events" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_daily_day_clerk_user_id_plan_source_provider_model_pk" PRIMARY KEY("day","clerk_user_id","plan","source","provider","model")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"source" text NOT NULL,
	"provider" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"plan" text NOT NULL,
	"ref" text,
	"cost_micros" bigint NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"estimated" boolean DEFAULT false NOT NULL,
	"price_version" integer,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "usage_windows" (
	"clerk_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"resets_at" timestamp with time zone NOT NULL,
	"spent_micros" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_windows_clerk_user_id_kind_pk" PRIMARY KEY("clerk_user_id","kind")
);
--> statement-breakpoint
ALTER TABLE "browser_sessions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "plan" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "plan_source" text;--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_costs_month_vendor_idx" ON "fixed_costs" USING btree ("month","vendor");--> statement-breakpoint
CREATE INDEX "plan_periods_user_idx" ON "plan_periods" USING btree ("clerk_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "plan_periods_starts_idx" ON "plan_periods" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "usage_daily_day_idx" ON "usage_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "usage_events_user_idx" ON "usage_events" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_created_idx" ON "usage_events" USING btree ("created_at");--> statement-breakpoint
-- Finance views for the admin dashboard. Money is in micro-dollars (divide by 1e6 for dollars).
-- Revenue: each paid period spread over the months it covers, by time, so a yearly plan counts a
-- twelfth in each month rather than all at once.
CREATE VIEW "v_revenue_month" AS
SELECT
  to_char(m.month, 'YYYY-MM') AS month,
  p.clerk_user_id,
  p.plan,
  round(p.gross_micros * share)::bigint AS gross_micros,
  round(p.store_fee_micros * share)::bigint AS store_fee_micros,
  round((p.gross_micros - p.store_fee_micros) * share)::bigint AS net_micros
FROM plan_periods p
CROSS JOIN LATERAL generate_series(date_trunc('month', p.starts_at AT TIME ZONE 'UTC'), date_trunc('month', (p.ends_at AT TIME ZONE 'UTC') - interval '1 second'), interval '1 month') AS m(month)
CROSS JOIN LATERAL (
  SELECT GREATEST(0, EXTRACT(EPOCH FROM LEAST(p.ends_at AT TIME ZONE 'UTC', m.month + interval '1 month') - GREATEST(p.starts_at AT TIME ZONE 'UTC', m.month)))
    / NULLIF(EXTRACT(EPOCH FROM p.ends_at - p.starts_at), 0) AS share
) AS s
WHERE p.ends_at > p.starts_at;
--> statement-breakpoint
-- What usage cost, per day and by every dimension.
CREATE VIEW "v_cost_by_day" AS
SELECT day, plan, source, provider, model,
  sum(cost_micros)::bigint AS cost_micros,
  sum(input_tokens)::bigint AS input_tokens,
  sum(cached_tokens)::bigint AS cached_tokens,
  sum(output_tokens)::bigint AS output_tokens,
  sum(seconds)::bigint AS seconds,
  sum(events)::bigint AS events,
  count(DISTINCT clerk_user_id) AS users
FROM usage_daily
GROUP BY day, plan, source, provider, model;
--> statement-breakpoint
-- Each person's month: what they paid us, what they cost us, and what was left.
CREATE VIEW "v_user_margin" AS
WITH cost AS (
  SELECT substr(day, 1, 7) AS month, clerk_user_id, max(plan) AS plan, sum(cost_micros)::bigint AS cost_micros
  FROM usage_daily GROUP BY 1, 2
), revenue AS (
  SELECT month, clerk_user_id, max(plan) AS plan, sum(gross_micros)::bigint AS gross_micros, sum(store_fee_micros)::bigint AS store_fee_micros, sum(net_micros)::bigint AS net_micros
  FROM v_revenue_month GROUP BY 1, 2
)
SELECT
  COALESCE(r.month, c.month) AS month,
  COALESCE(r.clerk_user_id, c.clerk_user_id) AS clerk_user_id,
  COALESCE(r.plan, c.plan) AS plan,
  COALESCE(r.gross_micros, 0) AS gross_micros,
  COALESCE(r.store_fee_micros, 0) AS store_fee_micros,
  COALESCE(r.net_micros, 0) AS net_micros,
  COALESCE(c.cost_micros, 0) AS cost_micros,
  COALESCE(r.net_micros, 0) - COALESCE(c.cost_micros, 0) AS margin_micros,
  CASE WHEN COALESCE(r.net_micros, 0) > 0 THEN round(100.0 * (r.net_micros - COALESCE(c.cost_micros, 0)) / r.net_micros, 1) END AS margin_pct
FROM revenue r
FULL OUTER JOIN cost c ON c.month = r.month AND c.clerk_user_id = r.clerk_user_id;
--> statement-breakpoint
-- Each plan's month: people, money in, money out, margin, and how spread out usage is.
CREATE VIEW "v_plan_margin" AS
SELECT month, plan,
  count(*) AS users,
  sum(gross_micros)::bigint AS gross_micros,
  sum(net_micros)::bigint AS net_micros,
  sum(cost_micros)::bigint AS cost_micros,
  sum(margin_micros)::bigint AS margin_micros,
  CASE WHEN sum(net_micros) > 0 THEN round(100.0 * sum(margin_micros) / sum(net_micros), 1) END AS margin_pct,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY cost_micros)::bigint AS p50_cost_micros,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY cost_micros)::bigint AS p90_cost_micros,
  max(cost_micros)::bigint AS max_cost_micros
FROM v_user_margin
GROUP BY month, plan;
--> statement-breakpoint
-- The bottom line per month: net revenue, minus usage, minus the fixed bills.
CREATE VIEW "v_profit_month" AS
WITH months AS (
  SELECT month FROM v_user_margin UNION SELECT month FROM fixed_costs
), money AS (
  SELECT month, sum(gross_micros)::bigint AS gross_micros, sum(store_fee_micros)::bigint AS store_fee_micros, sum(net_micros)::bigint AS net_micros, sum(cost_micros)::bigint AS usage_cost_micros
  FROM v_user_margin GROUP BY month
), fixed AS (
  SELECT month, sum(amount_micros)::bigint AS fixed_cost_micros FROM fixed_costs GROUP BY month
)
SELECT
  months.month,
  COALESCE(money.gross_micros, 0) AS gross_micros,
  COALESCE(money.store_fee_micros, 0) AS store_fee_micros,
  COALESCE(money.net_micros, 0) AS net_micros,
  COALESCE(money.usage_cost_micros, 0) AS usage_cost_micros,
  COALESCE(fixed.fixed_cost_micros, 0) AS fixed_cost_micros,
  COALESCE(money.net_micros, 0) - COALESCE(money.usage_cost_micros, 0) AS gross_profit_micros,
  COALESCE(money.net_micros, 0) - COALESCE(money.usage_cost_micros, 0) - COALESCE(fixed.fixed_cost_micros, 0) AS profit_micros
FROM months
LEFT JOIN money ON money.month = months.month
LEFT JOIN fixed ON fixed.month = months.month;
