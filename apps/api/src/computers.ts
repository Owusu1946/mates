import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
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

/** How long a desktop nobody uses or watches stays on before the sweeper stops it. */
export const IDLE_STOP_MS = 5 * 60_000;
/** The longest a desktop stays on without a task, even with the live view open (a phone left on a desk). */
export const MAX_ON_MS = 3 * 60 * 60_000;
/** A poll this recent means someone has the live view open. */
export const WATCHING_MS = 10_000;
const STOPPING_WAIT_MS = 90_000;
/** A start that hasn't finished in this long, and isn't running in this process, is picked up again. */
export const START_STALE_MS = 90_000;
/** How often a watched desktop resets Daytona's idle timer and is checked against Daytona's own state. */
const PROVIDER_CHECK_MS = 60_000;
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
  /** Computers on with no live goal that nobody has used or watched since `before`, or on since `onBefore`. */
  idleSince(before: Date, onBefore: Date): Promise<Computer[]>;
};

export type DesktopProvider = {
  create(userId: string): Promise<{ providerId: string; snapshot: string }>;
  start(providerId: string): Promise<Desktop>;
  attach(providerId: string): Promise<Desktop>;
  stop(providerId: string): Promise<void>;
  liveUrl(providerId: string, viewOnly: boolean): Promise<{ url: string; token: string; expiresAt: number }>;
  expireLiveUrl(providerId: string, token: string): Promise<void>;
  /** The provider's own state ("started", "stopped"…), or "gone" if the desktop was deleted. */
  state(providerId: string): Promise<string | undefined>;
  keepAlive(providerId: string): Promise<void>;
  /** The error means the desktop no longer exists, so a new one has to be made. */
  isGone(error: unknown): boolean;
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
    // Activity stamps (polls, a mate's steps) aren't changes of state: updatedAt is "since" for
    // the app's boot timer and the stale-start check, so they mustn't move it.
    const activityOnly = Object.keys(values).every((key) => key === "lastViewedAt" || key === "lastActiveAt");
    const [row] = await getDb().update(computers).set(activityOnly ? values : { ...values, updatedAt: new Date() }).where(and(...where)).returning();
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
  idleSince: (before, onBefore) =>
    getDb().select().from(computers).where(and(
      eq(computers.state, "on"),
      or(
        and(lt(sql`COALESCE(${computers.lastActiveAt}, ${computers.updatedAt})`, before), lt(sql`COALESCE(${computers.lastViewedAt}, ${computers.updatedAt})`, before)),
        lt(computers.onSince, onBefore),
      ),
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
  state: daytona.desktopState,
  keepAlive: daytona.keepDesktopAlive,
  isGone: daytona.desktopGone,
};

export const realComputerDeps = (): ComputerDeps => ({ store: dbComputerStore, provider: daytonaProvider, record: recordUsage, now: () => Date.now() });

export class ComputerError extends Error {}

// ── Lifecycle ─────────────────────────────────────────────────────────────────────────────

/** Starts in flight in this process, so a tap on Turn on and a mate's goal share one start. */
const inFlight = new Map<string, Promise<{ computer: Computer; desktop: Desktop }>>();

/** The user's desktop, on and ready for input. Creates it on first use. */
export function ensureComputer(userId: string, deps = realComputerDeps()): Promise<{ computer: Computer; desktop: Desktop }> {
  const running = inFlight.get(userId);
  if (running) return running;
  const work = bringUp(userId, deps).finally(() => inFlight.delete(userId));
  inFlight.set(userId, work);
  return work;
}

async function bringUp(userId: string, deps: ComputerDeps): Promise<{ computer: Computer; desktop: Desktop }> {
  let row = (await deps.store.byUser(userId)) ?? (await deps.store.create(userId));
  // The sweeper may be stopping it right now; starting mid-stop would race the provider.
  const deadline = deps.now() + STOPPING_WAIT_MS;
  while (row.state === "stopping" && deps.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    row = (await deps.store.byUser(userId))!;
  }
  try {
    if (row.state !== "on") row = (await deps.store.update(row.id, { state: "starting", error: null }))!;
    let desktop: Desktop;
    try {
      if (!row.providerId) row = await createDesktop(row, deps);
      desktop = await deps.provider.start(row.providerId!);
    } catch (error) {
      // Deleted on Daytona's side (by hand, or lost): make a new one rather than failing forever.
      if (!row.providerId || !deps.provider.isGone(error)) throw error;
      row = await createDesktop(row, deps);
      desktop = await deps.provider.start(row.providerId!);
    }
    const now = new Date(deps.now());
    row = (await deps.store.update(row.id, { state: "on", onSince: row.onSince ?? now, lastActiveAt: now, error: null }))!;
    return { computer: row, desktop };
  } catch (error) {
    const message = daytona.desktopError(error);
    await deps.store.update(row.id, { state: "error", error: message });
    throw new ComputerError(message);
  }
}

async function createDesktop(row: Computer, deps: ComputerDeps) {
  const created = await deps.provider.create(row.clerkUserId);
  return (await deps.store.update(row.id, { providerId: created.providerId, snapshot: created.snapshot, onSince: null }))!;
}

/**
 * Turns the computer on from the app, for the user to use themselves. Answers at once with the
 * computer "starting" (a first start can take a minute); the app watches it come on by polling.
 * With no task on it, the user has the mouse from the first frame.
 */
export async function startFromApp(userId: string, deps = realComputerDeps()) {
  const row = (await deps.store.byUser(userId)) ?? (await deps.store.create(userId));
  const goal = await deps.store.liveGoal(row.id);
  if (row.state === "on") {
    if (!goal) await deps.store.update(row.id, { controller: "user", lastActiveAt: new Date(deps.now()) });
    return computerView(userId, deps, { watching: true });
  }
  if (row.state !== "stopping") {
    await deps.store.update(row.id, { state: "starting", error: null, ...(goal ? {} : { controller: "user" as const }) });
  }
  void ensureComputer(userId, deps).catch(() => undefined);
  return computerView(userId, deps, { watching: true });
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

/**
 * Stops every desktop nobody has used or watched for IDLE_STOP_MS, and any on past MAX_ON_MS with
 * no task. Run by the dispatcher every minute.
 */
export async function sweepComputers(deps = realComputerDeps()) {
  const idle = await deps.store.idleSince(new Date(deps.now() - IDLE_STOP_MS), new Date(deps.now() - MAX_ON_MS));
  for (const computer of idle) await stopComputer(computer, deps).catch(() => console.warn("computer_stop_failed", { id: computer.id }));
  return idle.length;
}

// ── Live view and take-over ───────────────────────────────────────────────────────────────

const liveUrls = new Map<string, { url: string; token: string; expiresAt: number }>();
// Keyed by the sandbox, so a recreated desktop never gets an old link.
const cacheKey = (providerId: string, viewOnly: boolean) => `${providerId}:${viewOnly ? "view" : "control"}`;

async function dropLiveUrls(computer: Computer, deps: ComputerDeps, only?: "control") {
  if (!computer.providerId) return;
  for (const viewOnly of only ? [false] : [true, false]) {
    const key = cacheKey(computer.providerId, viewOnly);
    const cached = liveUrls.get(key);
    liveUrls.delete(key);
    if (cached) await deps.provider.expireLiveUrl(computer.providerId, cached.token).catch(() => undefined);
  }
}

/** A live-view link, reused while it has a minute left so the phone doesn't reload the stream. */
async function liveUrlFor(computer: Computer, viewOnly: boolean, deps: ComputerDeps) {
  if (computer.state !== "on" || !computer.providerId) return null;
  // A mate has the mouse: the user's control link from before stops working.
  if (viewOnly && liveUrls.has(cacheKey(computer.providerId, false))) await dropLiveUrls(computer, deps, "control");
  const key = cacheKey(computer.providerId, viewOnly);
  const cached = liveUrls.get(key);
  if (cached && cached.expiresAt - deps.now() > 60_000) return cached.url;
  const fresh = await deps.provider.liveUrl(computer.providerId, viewOnly);
  liveUrls.set(key, fresh);
  return fresh.url;
}

/** Who has the mouse. Only a live task can hold it for a mate; with none, it's always the user's. */
const controllerOf = (computer: Computer, goal: ComputerGoal | null): Computer["controller"] => (goal ? computer.controller : "user");

const lastProviderCheck = new Map<string, number>();

/**
 * While someone watches a desktop that's on: resets Daytona's idle timer (the user may be working
 * by hand, which Daytona can't see), and notices one that stopped or vanished behind our back.
 * At most once a minute per desktop. Returns the row as it now stands.
 */
async function checkProvider(computer: Computer, deps: ComputerDeps): Promise<Computer> {
  if (computer.state !== "on" || !computer.providerId) return computer;
  const last = lastProviderCheck.get(computer.providerId) ?? 0;
  if (deps.now() - last < PROVIDER_CHECK_MS) return computer;
  lastProviderCheck.set(computer.providerId, deps.now());
  try {
    const state = await deps.provider.state(computer.providerId);
    if (state === "started") {
      await deps.provider.keepAlive(computer.providerId);
      return computer;
    }
    if (state === "starting") return computer;
    // Stopped (Daytona's own backstop) or deleted: charge the time it was on and show it off.
    await stopComputer(computer, deps);
    if (state === "gone") return (await deps.store.update(computer.id, { providerId: null, snapshot: null, state: "off", error: null })) ?? computer;
    return (await deps.store.byUser(computer.clerkUserId)) ?? computer;
  } catch {
    // The provider is unreachable for a moment; the next check tries again.
    return computer;
  }
}

export type ComputerView = {
  state: Computer["state"];
  controller: Computer["controller"];
  liveUrl: string | null;
  error: string | null;
  /** When the state last changed, for "Waking your computer… 0:12". */
  since: string;
  /** The first start ever: the desktop is being made, which takes longer. */
  setup: boolean;
  goal: {
    id: string; goal: string; status: ComputerGoal["status"]; waitingFor: ComputerGoal["waitingFor"]; question: string | null;
    mateId: string | null; step: string | null; chatId: string | null;
  } | null;
};

/**
 * What the app shows. `watching` means the live view is on screen: that keeps an idle desktop on,
 * slows the mate to a pace people can follow, and keeps Daytona from auto-stopping it.
 */
export async function computerView(userId: string, deps = realComputerDeps(), options: { watching?: boolean } = {}): Promise<ComputerView> {
  let computer = await deps.store.byUser(userId);
  if (!computer) return { state: "off", controller: "user", liveUrl: null, error: null, since: new Date(deps.now()).toISOString(), setup: true, goal: null };
  if (options.watching) computer = (await deps.store.update(computer.id, { lastViewedAt: new Date(deps.now()) })) ?? computer;
  // A start whose process died (a deploy, a crash) is picked up again rather than spinning forever.
  if (computer.state === "starting" && !inFlight.has(userId) && deps.now() - computer.updatedAt.getTime() > START_STALE_MS) {
    void ensureComputer(userId, deps).catch(() => undefined);
  }
  if (options.watching) computer = await checkProvider(computer, deps);
  const goal = await deps.store.liveGoal(computer.id);
  const controller = controllerOf(computer, goal);
  let liveUrl: string | null = null;
  try {
    liveUrl = await liveUrlFor(computer, controller !== "user", deps);
  } catch {
    // Signing failed for a moment; the next poll gets one. Check the desktop is still there soon.
    if (computer.providerId) lastProviderCheck.delete(computer.providerId);
  }
  return {
    state: computer.state,
    controller,
    liveUrl,
    error: computer.state === "error" ? computer.error : null,
    since: computer.updatedAt.toISOString(),
    setup: !computer.providerId || (computer.state === "starting" && !computer.lastActiveAt),
    goal: goal ? {
      id: goal.id, goal: goal.goal, status: goal.status, waitingFor: goal.waitingFor, question: goal.question ?? null,
      mateId: goal.mateId, step: goal.steps.at(-1)?.label ?? null, chatId: goal.chatId ?? null,
    } : null,
  };
}

/** Hands the mouse to the user. The mate pauses at its next step and waits for Hand back. */
export async function takeOver(userId: string, deps = realComputerDeps()) {
  const computer = await deps.store.byUser(userId);
  if (!computer || computer.state !== "on") throw new ComputerError("The computer is off. Turn it on first.");
  await deps.store.update(computer.id, { controller: "user", lastActiveAt: new Date(deps.now()) }, { controller: "mate" });
  const goal = await deps.store.liveGoal(computer.id);
  if (goal?.status === "running") await deps.store.updateGoal(goal.id, { status: "waiting", waitingFor: "user_control", question: null }, { status: "running" });
  return computerView(userId, deps, { watching: true });
}

/** Gives the mouse back. A goal paused for take-over carries on, looking at the screen afresh first. */
export async function handBack(userId: string, deps = realComputerDeps()) {
  const computer = await deps.store.byUser(userId);
  if (!computer) throw new ComputerError("There's no computer yet.");
  const goal = await deps.store.liveGoal(computer.id);
  // With no task there's no one to hand back to; the user keeps the mouse.
  if (!goal) return computerView(userId, deps, { watching: true });
  const claimed = await deps.store.update(computer.id, { controller: "mate", lastActiveAt: new Date(deps.now()) }, { controller: "user" });
  if (claimed) await dropLiveUrls(claimed, deps, "control");
  if (goal.waitingFor === "user_control") await deps.store.updateGoal(goal.id, { status: "running", waitingFor: null, reply: "handback" }, { waitingFor: "user_control" });
  return computerView(userId, deps, { watching: true });
}

export const INPUT_KEYS = ["Enter", "Tab", "Backspace", "Escape", "Up", "Down", "Left", "Right"] as const;

/**
 * Typing from the app while the user has the mouse: passwords, codes, anything private. It goes
 * straight to the focused field and is never stored, logged or shown to a model.
 */
export async function computerInput(userId: string, input: { text?: string; key?: (typeof INPUT_KEYS)[number] }, deps = realComputerDeps()) {
  const computer = await deps.store.byUser(userId);
  if (!computer || computer.state !== "on" || !computer.providerId) throw new ComputerError("The computer is off.");
  if (controllerOf(computer, await deps.store.liveGoal(computer.id)) !== "user") throw new ComputerError("Take over the computer before typing.");
  const desktop = await deps.provider.attach(computer.providerId);
  if (input.text) await desktop.type(input.text);
  if (input.key) await desktop.press(input.key.toLowerCase());
  await deps.store.update(computer.id, { lastActiveAt: new Date(deps.now()) });
}

/** Turns the desktop off from the app. A task on it is cancelled too; its worker notices and closes it. */
export async function stopFromApp(userId: string, deps = realComputerDeps()) {
  const computer = await deps.store.byUser(userId);
  if (!computer) return computerView(userId, deps);
  const goal = await deps.store.liveGoal(computer.id);
  if (goal) await deps.store.updateGoal(goal.id, { cancelRequested: true });
  if (computer.state === "starting") {
    // Let the start finish, then turn it off, so the provider is never stopped mid-start.
    const running = inFlight.get(userId);
    if (running) void running.then(({ computer: on }) => stopComputer(on, deps)).catch(() => undefined);
    else await deps.store.update(computer.id, { state: "off", error: null });
  } else {
    await stopComputer(computer, deps);
  }
  return computerView(userId, deps);
}

/** Deletes the user's desktop and everything on it (logins, files), for account deletion. */
export async function deleteComputerFor(userId: string) {
  const computer = await dbComputerStore.byUser(userId);
  if (computer?.providerId && computerConfigured()) await daytona.deleteDesktop(computer.providerId);
}

export async function computerAvailableFor(userId: string) {
  return computerConfigured() && canUseComputer(await userPlan(userId));
}
