import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { computerGoals, computers, type ComputerGoalStatus } from "./db/schema.js";
import * as daytona from "./desktop/daytona.js";
import type { Desktop } from "./desktop/types.js";
import { userPlan } from "./usage/gate.js";
import { canUseComputer, type PlanId } from "./usage/plans.js";
import { perMinute } from "./usage/prices.js";
import { recordUsage } from "./usage/record.js";

/**
 * Each user's desktop: created on first use, started for work, stopped when idle. Its disk keeps
 * Chrome's logins and the files between goals. One mouse, so one controller at a time: a mate, or
 * the user after Take over.
 */

export type Computer = typeof computers.$inferSelect;
export type ComputerGoal = typeof computerGoals.$inferSelect;

/** How long a desktop with nothing to do stays on before the sweeper stops it. */
export const IDLE_STOP_MS = 5 * 60_000;
/** A poll this recent means someone has the live view open. */
export const WATCHING_MS = 10_000;
const STOPPING_WAIT_MS = 90_000;
export const LIVE_GOAL: ComputerGoalStatus[] = ["running", "waiting"];

export const computerConfigured = () => daytona.daytonaConfigured();
export const computerAvailable = (plan: PlanId) => computerConfigured() && canUseComputer(plan);

// ── What the lifecycle depends on, injectable so it can be tested without Daytona ─────────

export type ComputerStore = {
  byUser(userId: string): Promise<Computer | null>;
  create(userId: string): Promise<Computer>;
  /** Writes `values` only when the row still matches `expect` (compare-and-set); null if it didn't. */
  update(id: string, values: Partial<Computer>, expect?: Partial<Pick<Computer, "state" | "controller">>): Promise<Computer | null>;
  liveGoal(computerId: string): Promise<ComputerGoal | null>;
  updateGoal(id: string, values: Partial<ComputerGoal>, expect?: Partial<Pick<ComputerGoal, "status" | "waitingFor">>): Promise<ComputerGoal | null>;
  /** Computers on with no live goal and no activity since `before`. */
  idleSince(before: Date): Promise<Computer[]>;
};

export type DesktopProvider = {
  create(userId: string): Promise<{ providerId: string; snapshot: string }>;
  start(providerId: string): Promise<Desktop>;
  attach(providerId: string): Promise<Desktop>;
  stop(providerId: string): Promise<void>;
  liveUrl(providerId: string, viewOnly: boolean): Promise<{ url: string; token: string; expiresAt: number }>;
  expireLiveUrl(providerId: string, token: string): Promise<void>;
};

export type ComputerDeps = { store: ComputerStore; provider: DesktopProvider; record: typeof recordUsage; now(): number };

export const dbComputerStore: ComputerStore = {
  byUser: async (userId) => (await getDb().select().from(computers).where(eq(computers.clerkUserId, userId)))[0] ?? null,
  async create(userId) {
    const [row] = await getDb().insert(computers).values({ clerkUserId: userId }).onConflictDoNothing().returning();
    return row ?? (await dbComputerStore.byUser(userId))!;
  },
  async update(id, values, expect) {
    const where = [eq(computers.id, id)];
    if (expect?.state) where.push(eq(computers.state, expect.state));
    if (expect?.controller) where.push(eq(computers.controller, expect.controller));
    const [row] = await getDb().update(computers).set({ ...values, updatedAt: new Date() }).where(and(...where)).returning();
    return row ?? null;
  },
  liveGoal: async (computerId) =>
    (await getDb().select().from(computerGoals).where(and(eq(computerGoals.computerId, computerId), inArray(computerGoals.status, LIVE_GOAL))))[0] ?? null,
  async updateGoal(id, values, expect) {
    const where = [eq(computerGoals.id, id)];
    if (expect?.status) where.push(eq(computerGoals.status, expect.status));
    if (expect?.waitingFor) where.push(eq(computerGoals.waitingFor, expect.waitingFor));
    const [row] = await getDb().update(computerGoals).set({ ...values, updatedAt: new Date() }).where(and(...where)).returning();
    return row ?? null;
  },
  idleSince: (before) =>
    getDb().select().from(computers).where(and(
      eq(computers.state, "on"),
      lt(computers.lastActiveAt, before),
      sql`NOT EXISTS (SELECT 1 FROM ${computerGoals} WHERE ${computerGoals.computerId} = ${computers.id} AND ${computerGoals.status} IN ('running','waiting'))`,
    )),
};

const daytonaProvider: DesktopProvider = {
  create: daytona.createDesktopSandbox,
  start: daytona.startDesktop,
  attach: daytona.attachDesktop,
  stop: daytona.stopDesktop,
  liveUrl: daytona.liveUrl,
  expireLiveUrl: daytona.expireLiveUrl,
};

export const realComputerDeps = (): ComputerDeps => ({ store: dbComputerStore, provider: daytonaProvider, record: recordUsage, now: () => Date.now() });

export class ComputerError extends Error {}

// ── Lifecycle ─────────────────────────────────────────────────────────────────────────────

/** The user's desktop, on and ready for input. Creates it on first use. */
export async function ensureComputer(userId: string, deps = realComputerDeps()): Promise<{ computer: Computer; desktop: Desktop }> {
  let row = (await deps.store.byUser(userId)) ?? (await deps.store.create(userId));
  // The sweeper may be stopping it right now; starting mid-stop would race the provider.
  const deadline = deps.now() + STOPPING_WAIT_MS;
  while (row.state === "stopping" && deps.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    row = (await deps.store.byUser(userId))!;
  }
  try {
    if (!row.providerId) {
      const created = await deps.provider.create(userId);
      row = (await deps.store.update(row.id, { providerId: created.providerId, snapshot: created.snapshot }))!;
    }
    if (row.state !== "on") row = (await deps.store.update(row.id, { state: "starting", error: null }))!;
    const desktop = await deps.provider.start(row.providerId!);
    const now = new Date(deps.now());
    row = (await deps.store.update(row.id, { state: "on", onSince: row.onSince ?? now, lastActiveAt: now, error: null }))!;
    return { computer: row, desktop };
  } catch (error) {
    const message = daytona.desktopError(error);
    await deps.store.update(row.id, { state: "error", error: message });
    throw new ComputerError(message);
  }
}

/** Stops the desktop and charges the time it was on, once. Safe to call twice. */
export async function stopComputer(computer: Computer, deps = realComputerDeps()) {
  const claimed = await deps.store.update(computer.id, { state: "stopping" }, { state: "on" })
    ?? await deps.store.update(computer.id, { state: "stopping" }, { state: "error" });
  if (!claimed) return;
  await dropLiveUrls(claimed, deps);
  let stopped = true;
  try {
    if (claimed.providerId) await deps.provider.stop(claimed.providerId);
  } catch {
    stopped = false;
  }
  const onSince = claimed.onSince;
  if (onSince) {
    const seconds = Math.max(0, Math.round((deps.now() - onSince.getTime()) / 1000));
    void deps.record({
      userId: claimed.clerkUserId, source: "computer", provider: "daytona", ref: claimed.id, seconds,
      costMicros: perMinute("COMPUTER_MINUTE", seconds, 60), estimated: true, key: `computer:${claimed.id}:${onSince.getTime()}`,
    });
  }
  // A failed stop leaves it marked error, and Daytona's own auto-stop is the backstop.
  await deps.store.update(claimed.id, stopped
    ? { state: "off", onSince: null, controller: "mate", error: null }
    : { state: "error", onSince: null, controller: "mate", error: "The computer didn't stop cleanly; it will stop on its own." });
}

/** Stops every desktop that has sat idle past IDLE_STOP_MS. Run by the dispatcher every minute. */
export async function sweepComputers(deps = realComputerDeps()) {
  const idle = await deps.store.idleSince(new Date(deps.now() - IDLE_STOP_MS));
  for (const computer of idle) await stopComputer(computer, deps).catch(() => console.warn("computer_stop_failed", { id: computer.id }));
  return idle.length;
}

// ── Live view and take-over ───────────────────────────────────────────────────────────────

const liveUrls = new Map<string, { url: string; token: string; expiresAt: number }>();
const cacheKey = (id: string, viewOnly: boolean) => `${id}:${viewOnly ? "view" : "control"}`;

async function dropLiveUrls(computer: Computer, deps: ComputerDeps, only?: "control") {
  for (const viewOnly of only ? [false] : [true, false]) {
    const cached = liveUrls.get(cacheKey(computer.id, viewOnly));
    liveUrls.delete(cacheKey(computer.id, viewOnly));
    if (cached && computer.providerId) await deps.provider.expireLiveUrl(computer.providerId, cached.token).catch(() => undefined);
  }
}

/** A live-view link, reused while it has a minute left so the phone doesn't reload the stream. */
async function liveUrlFor(computer: Computer, deps: ComputerDeps) {
  if (computer.state !== "on" || !computer.providerId) return null;
  const viewOnly = computer.controller !== "user";
  const key = cacheKey(computer.id, viewOnly);
  const cached = liveUrls.get(key);
  if (cached && cached.expiresAt - deps.now() > 60_000) return cached.url;
  const fresh = await deps.provider.liveUrl(computer.providerId, viewOnly);
  liveUrls.set(key, fresh);
  return fresh.url;
}

export type ComputerView = {
  state: Computer["state"];
  controller: Computer["controller"];
  liveUrl: string | null;
  error: string | null;
  goal: { id: string; goal: string; status: ComputerGoal["status"]; waitingFor: ComputerGoal["waitingFor"]; mateId: string | null; step: string | null } | null;
};

/** What the app shows. Polling it also tells the mate someone is watching. */
export async function computerView(userId: string, deps = realComputerDeps()): Promise<ComputerView> {
  let computer = await deps.store.byUser(userId);
  if (!computer) return { state: "off", controller: "mate", liveUrl: null, error: null, goal: null };
  computer = (await deps.store.update(computer.id, { lastViewedAt: new Date(deps.now()) })) ?? computer;
  const goal = await deps.store.liveGoal(computer.id);
  let liveUrl: string | null = null;
  try {
    liveUrl = await liveUrlFor(computer, deps);
  } catch {
    liveUrl = null;
  }
  return {
    state: computer.state,
    controller: computer.controller,
    liveUrl,
    error: computer.error,
    goal: goal ? { id: goal.id, goal: goal.goal, status: goal.status, waitingFor: goal.waitingFor, mateId: goal.mateId, step: goal.steps.at(-1)?.label ?? null } : null,
  };
}

/** Hands the mouse to the user. The mate pauses at its next step and waits for Hand back. */
export async function takeOver(userId: string, deps = realComputerDeps()) {
  const computer = await deps.store.byUser(userId);
  if (!computer || computer.state !== "on") throw new ComputerError("The computer is off. It turns on when a mate starts a task.");
  const claimed = await deps.store.update(computer.id, { controller: "user", lastActiveAt: new Date(deps.now()) }, { controller: "mate" });
  const goal = await deps.store.liveGoal(computer.id);
  if (goal?.status === "running") await deps.store.updateGoal(goal.id, { status: "waiting", waitingFor: "user_control", question: null }, { status: "running" });
  if (claimed) await dropLiveUrls(claimed, deps);
  return computerView(userId, deps);
}

/** Gives the mouse back. A goal paused for take-over carries on, looking at the screen afresh first. */
export async function handBack(userId: string, deps = realComputerDeps()) {
  const computer = await deps.store.byUser(userId);
  if (!computer) throw new ComputerError("There's no computer yet.");
  const claimed = await deps.store.update(computer.id, { controller: "mate", lastActiveAt: new Date(deps.now()) }, { controller: "user" });
  if (claimed) await dropLiveUrls(claimed, deps, "control");
  const goal = await deps.store.liveGoal(computer.id);
  if (goal?.waitingFor === "user_control") await deps.store.updateGoal(goal.id, { status: "running", waitingFor: null, reply: "handback" }, { waitingFor: "user_control" });
  return computerView(userId, deps);
}

export const INPUT_KEYS = ["Enter", "Tab", "Backspace", "Escape"] as const;

/**
 * Typing from the app while the user has the mouse: passwords, codes, anything private. It goes
 * straight to the focused field and is never stored, logged or shown to a model.
 */
export async function computerInput(userId: string, input: { text?: string; key?: (typeof INPUT_KEYS)[number] }, deps = realComputerDeps()) {
  const computer = await deps.store.byUser(userId);
  if (!computer || computer.state !== "on" || !computer.providerId) throw new ComputerError("The computer is off.");
  if (computer.controller !== "user") throw new ComputerError("Take over the computer before typing.");
  const desktop = await deps.provider.attach(computer.providerId);
  if (input.text) await desktop.type(input.text);
  if (input.key) await desktop.press(input.key.toLowerCase());
  await deps.store.update(computer.id, { lastActiveAt: new Date(deps.now()) });
}

/** Stops the desktop from the app. A goal on it is cancelled first. */
export async function stopFromApp(userId: string, deps = realComputerDeps()) {
  const computer = await deps.store.byUser(userId);
  if (!computer) return computerView(userId, deps);
  const goal = await deps.store.liveGoal(computer.id);
  if (goal) await deps.store.updateGoal(goal.id, { cancelRequested: true });
  else await stopComputer(computer, deps);
  return computerView(userId, deps);
}

export async function computerAvailableFor(userId: string) {
  return computerConfigured() && canUseComputer(await userPlan(userId));
}
