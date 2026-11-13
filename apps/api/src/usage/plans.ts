/**
 * Plans and their usage budgets. Budgets are what usage may cost us, in micro-dollars (millionths of
 * a US dollar), not what people pay: Starter's weekly budget is 40% of $8 spread over a month's
 * weeks, and the other plans scale by the multipliers on the landing page (Plus 2×, Pro 6×, Max 12×).
 * People see a percentage, never these numbers. Each budget can be overridden with an env var, e.g.
 * USAGE_STARTER_WEEKLY_MICROS or USAGE_PRO_SESSION_MICROS.
 */
export const PLAN_IDS = ["starter", "plus", "pro", "max", "none"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type WindowKind = "5h" | "week";

const WEEKS_PER_MONTH = 52 / 12;
const STARTER_PRICE_MICROS = 8_000_000;
/** The share of the price usage may cost us at full use. */
const COST_SHARE = 0.4;
const STARTER_WEEKLY = Math.round((STARTER_PRICE_MICROS * COST_SHARE) / WEEKS_PER_MONTH);
/** A 5-hour session may use a quarter of the week, so one long session can't spend it all. */
const SESSION_SHARE = 0.25;

type PlanSpec = { label: string; priceMicros: number; weekly: number; session: number | null };

const SPECS: Record<PlanId, PlanSpec> = {
  starter: { label: "Starter", priceMicros: 8_000_000, weekly: STARTER_WEEKLY, session: Math.round(STARTER_WEEKLY * SESSION_SHARE) },
  plus: { label: "Plus", priceMicros: 15_000_000, weekly: STARTER_WEEKLY * 2, session: Math.round(STARTER_WEEKLY * 2 * SESSION_SHARE) },
  pro: { label: "Pro", priceMicros: 40_000_000, weekly: STARTER_WEEKLY * 6, session: Math.round(STARTER_WEEKLY * 6 * SESSION_SHARE) },
  // Max has no 5-hour limit, only the weekly one.
  max: { label: "Max", priceMicros: 80_000_000, weekly: STARTER_WEEKLY * 12, session: null },
  none: { label: "No plan", priceMicros: 0, weekly: 0, session: 0 },
};

export const WINDOW_MS: Record<WindowKind, number> = { "5h": 5 * 60 * 60_000, week: 7 * 24 * 60 * 60_000 };

const override = (name: string) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 && process.env[name] !== "" && process.env[name] !== undefined ? Math.round(value) : undefined;
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

/** The plan for accounts we haven't set one for: Starter until payments exist, then "none". */
export function defaultPlan(): PlanId {
  const value = process.env.DEFAULT_PLAN;
  return isPlanId(value) ? value : "starter";
}

export function resolvePlan(stored: string | null | undefined): PlanId {
  return isPlanId(stored) ? stored : defaultPlan();
}

export function planSpec(plan: PlanId) {
  const spec = SPECS[plan];
  const key = plan.toUpperCase();
  return {
    id: plan,
    label: spec.label,
    priceMicros: override(`PLAN_${key}_PRICE_MICROS`) ?? spec.priceMicros,
    budgets: {
      week: override(`USAGE_${key}_WEEKLY_MICROS`) ?? spec.weekly,
      "5h": spec.session === null ? null : (override(`USAGE_${key}_SESSION_MICROS`) ?? spec.session),
    } as Record<WindowKind, number | null>,
  };
}
