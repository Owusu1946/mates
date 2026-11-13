import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { profiles, usageWindows } from "../db/schema.js";
import { planSpec, resolvePlan, type PlanId, type WindowKind } from "./plans.js";

export type UsageWindowState = { kind: WindowKind; usedPct: number; resetsAt: string | null };
export type BlockReason = WindowKind | "no_plan";
export type UsageState = {
  plan: { id: PlanId; label: string };
  windows: UsageWindowState[];
  blocked: { reason: BlockReason; resetsAt: string | null } | null;
  /** What's left before the tighter window runs out, in micro-dollars; null when nothing limits it. */
  remainingMicros: number;
};
type WindowRow = { kind: string; resetsAt: Date; spentMicros: number };

/** `off` skips every check, `shadow` logs who would be stopped, `on` stops them. */
export function enforcement(): "off" | "shadow" | "on" {
  const mode = process.env.USAGE_ENFORCE;
  return mode === "on" || mode === "off" ? mode : "shadow";
}

const ORDER: WindowKind[] = ["5h", "week"];

/** Works out where someone stands from their plan and window rows; pure, so it's easy to test. */
export function evaluateUsage(stored: string | null | undefined, rows: WindowRow[], now = new Date()): UsageState {
  const spec = planSpec(resolvePlan(stored));
  const windows: UsageWindowState[] = [];
  let blocked: UsageState["blocked"] = null;
  let remaining = Number.POSITIVE_INFINITY;
  if (spec.id === "none") return { plan: { id: spec.id, label: spec.label }, windows, blocked: { reason: "no_plan", resetsAt: null }, remainingMicros: 0 };
  for (const kind of ORDER) {
    const budget = spec.budgets[kind];
    if (budget === null) continue;
    const row = rows.find((r) => r.kind === kind);
    // A window that has run out is empty until the next use starts a new one.
    const live = row && row.resetsAt.getTime() > now.getTime();
    const spent = live ? row.spentMicros : 0;
    const resetsAt = live ? row.resetsAt.toISOString() : null;
    windows.push({ kind, usedPct: budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 100, resetsAt });
    remaining = Math.min(remaining, Math.max(0, budget - spent));
    // When both are used up, the later reset is the one that matters.
    if (spent >= budget && (!blocked || (resetsAt && blocked.resetsAt && resetsAt > blocked.resetsAt))) blocked = { reason: kind, resetsAt };
  }
  return { plan: { id: spec.id, label: spec.label }, windows, blocked, remainingMicros: Number.isFinite(remaining) ? remaining : 0 };
}

export async function usageState(userId: string, now = new Date()): Promise<UsageState> {
  const db = getDb();
  const [profile, rows] = await Promise.all([
    db.select({ plan: profiles.plan }).from(profiles).where(eq(profiles.clerkUserId, userId)).then((r) => r[0]),
    db.select({ kind: usageWindows.kind, resetsAt: usageWindows.resetsAt, spentMicros: usageWindows.spentMicros }).from(usageWindows).where(eq(usageWindows.clerkUserId, userId)),
  ]);
  return evaluateUsage(profile?.plan, rows, now);
}

/** "2 h 10 m", "45 m", "less than a minute". */
export function untilText(resetsAt: string | null, now = new Date()) {
  if (!resetsAt) return null;
  const minutes = Math.max(0, Math.ceil((new Date(resetsAt).getTime() - now.getTime()) / 60_000));
  if (minutes < 1) return "less than a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return hours ? `${days} d ${hours} h` : `${days} d`;
  return hours ? (rest ? `${hours} h ${rest} m` : `${hours} h`) : `${rest} m`;
}

export function limitMessage(blocked: NonNullable<UsageState["blocked"]>, now = new Date()) {
  if (blocked.reason === "no_plan") return "Choose a plan to keep using mates.";
  const until = untilText(blocked.resetsAt, now);
  const which = blocked.reason === "5h" ? "your 5-hour limit" : "your weekly limit";
  return `You’ve reached ${which}.${until ? ` It resets in ${until}.` : ""}`;
}

export class UsageLimitError extends Error {
  constructor(
    readonly reason: BlockReason,
    readonly resetsAt: string | null,
    readonly plan: PlanId,
    message: string,
  ) {
    super(message);
    this.name = "UsageLimitError";
  }
}

/**
 * Stops new work when someone is out of usage. Fails open: if usage can't be read, the work goes
 * ahead, since a metering outage shouldn't take the product down. Returns the state it checked.
 */
export async function assertUsage(userId: string, what = "work"): Promise<UsageState | null> {
  const mode = enforcement();
  if (mode === "off") return null;
  let state: UsageState;
  try {
    state = await usageState(userId);
  } catch (error) {
    console.warn("usage_check_failed", { userId, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
  if (!state.blocked) return state;
  if (mode === "shadow") {
    console.info("usage_would_block", { userId, what, reason: state.blocked.reason, plan: state.plan.id, resetsAt: state.blocked.resetsAt });
    return state;
  }
  throw new UsageLimitError(state.blocked.reason, state.blocked.resetsAt, state.plan.id, limitMessage(state.blocked));
}

/** True when someone may keep going, for checks between steps of long work. Never throws. */
export async function hasUsageLeft(userId: string): Promise<boolean> {
  try {
    await assertUsage(userId, "step");
    return true;
  } catch (error) {
    if (error instanceof UsageLimitError) return false;
    return true;
  }
}

/** The budget still free, for capping long work up front; null when limits aren't enforced. */
export async function remainingBudget(userId: string): Promise<number | null> {
  if (enforcement() !== "on") return null;
  try {
    return (await usageState(userId)).remainingMicros;
  } catch {
    return null;
  }
}

/**
 * How long a call or meeting may run on what's left of the budget, at its per-minute price, never
 * past `maxMs` and never under a minute (time to say goodbye). Undefined when limits aren't enforced.
 */
export async function usageCapMs(userId: string, minutePrice: number, maxMs: number): Promise<number | undefined> {
  const left = await remainingBudget(userId);
  if (left === null || minutePrice <= 0) return undefined;
  return Math.max(60_000, Math.min(maxMs, Math.floor((left / minutePrice) * 60_000)));
}

/** GET /v1/usage. */
export type UsageResponse = UsageState & { enforced: boolean; upgradeUrl: string };
/** The error body of a 429 (out of usage) or 402 (no plan) from any route that starts work. */
export type UsageLimitBody = {
  error: { code: "usage_limit" | "plan_required"; message: string; requestId: string; window: WindowKind | null; resetsAt: string | null; plan: PlanId; upgradeUrl: string };
};
