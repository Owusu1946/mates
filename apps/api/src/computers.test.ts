import { describe, expect, it, vi } from "vitest";
import {
  computerInput, computerView, ensureComputer, handBack, IDLE_STOP_MS, stopComputer, sweepComputers, takeOver,
  type Computer, type ComputerDeps, type ComputerGoal,
} from "./computers.js";
import type { Desktop } from "./desktop/types.js";

vi.mock("./db/client.js", () => ({ getDb: () => { throw new Error("no database in tests"); } }));

const USER = "user_1";
let sandboxes = 0;

/** An in-memory store and a fake provider that records what it was asked to do. */
function harness(start?: Partial<Computer>) {
  const sbx = `sbx${++sandboxes}`;
  let clock = 1_000_000;
  const rows = new Map<string, Computer>();
  const goals = new Map<string, ComputerGoal>();
  const calls: string[] = [];
  const typed: string[] = [];
  const recorded: { key?: string; seconds?: number; costMicros: number }[] = [];
  const base: Computer = {
    id: "c1", clerkUserId: USER, provider: "daytona", providerId: null, snapshot: null, state: "off", onSince: null,
    lastActiveAt: null, lastViewedAt: null, controller: "mate", error: null, createdAt: new Date(0), updatedAt: new Date(0),
  };
  if (start) rows.set("c1", { ...base, ...start, ...(start.providerId ? { providerId: sbx } : {}) });
  const desktop = { id: "sbx", type: async (text: string) => { typed.push(text); }, press: async (key: string) => { typed.push(`<${key}>`); } } as unknown as Desktop;
  const fits = (row: Record<string, unknown>, expect?: Record<string, unknown>) => !expect || Object.entries(expect).every(([k, v]) => row[k] === v);
  const deps: ComputerDeps = {
    now: () => clock,
    record: (async (input: { key?: string; seconds?: number; costMicros: number }) => { recorded.push(input); }) as never,
    store: {
      byUser: async (userId) => [...rows.values()].find((r) => r.clerkUserId === userId) ?? null,
      create: async (userId) => { const row = { ...base, clerkUserId: userId }; rows.set(row.id, row); return row; },
      update: async (id, values, expect) => {
        const row = rows.get(id);
        if (!row || !fits(row, expect)) return null;
        const next = { ...row, ...values };
        rows.set(id, next);
        return next;
      },
      liveGoal: async (computerId) => [...goals.values()].find((g) => g.computerId === computerId && ["running", "waiting"].includes(g.status)) ?? null,
      updateGoal: async (id, values, expect) => {
        const goal = goals.get(id);
        if (!goal || !fits(goal, expect)) return null;
        const next = { ...goal, ...values };
        goals.set(id, next);
        return next;
      },
      idleSince: async (before) => [...rows.values()].filter((r) => r.state === "on" && r.lastActiveAt && r.lastActiveAt < before
        && ![...goals.values()].some((g) => g.computerId === r.id && ["running", "waiting"].includes(g.status))),
    },
    provider: {
      create: async () => { calls.push("create"); return { providerId: sbx, snapshot: "mates-desktop-1" }; },
      start: async () => { calls.push("start"); return desktop; },
      attach: async () => desktop,
      stop: async () => { calls.push("stop"); },
      liveUrl: async (_id, viewOnly) => { calls.push(viewOnly ? "url:view" : "url:control"); return { url: `https://live/${viewOnly ? "view" : "control"}`, token: "t", expiresAt: clock + 600_000 }; },
      expireLiveUrl: async () => { calls.push("expire"); },
    },
  };
  const addGoal = (status: ComputerGoal["status"], waitingFor: ComputerGoal["waitingFor"] = null) => {
    const goal = { id: "g1", computerId: "c1", clerkUserId: USER, status, waitingFor, steps: [], goal: "Make a table", mateId: null } as unknown as ComputerGoal;
    goals.set(goal.id, goal);
  };
  return { deps, rows, goals, calls, typed, recorded, addGoal, tick: (ms: number) => { clock += ms; }, row: () => rows.get("c1")! };
}

describe("ensureComputer", () => {
  it("creates the desktop on first use, then starts it", async () => {
    const h = harness();
    const { computer } = await ensureComputer(USER, h.deps);
    expect(h.calls).toEqual(["create", "start"]);
    expect(computer).toMatchObject({ state: "on", snapshot: "mates-desktop-1" });
    expect(computer.providerId).toMatch(/^sbx/);
    expect(computer.onSince).not.toBeNull();
  });

  it("reuses an existing desktop and keeps the original onSince while it stays on", async () => {
    const onSince = new Date(500_000);
    const h = harness({ providerId: "sbx", state: "on", onSince });
    const { computer } = await ensureComputer(USER, h.deps);
    expect(h.calls).toEqual(["start"]);
    expect(computer.onSince).toEqual(onSince);
  });

  it("marks the computer as errored with a plain sentence when the provider fails", async () => {
    const h = harness({ providerId: "sbx" });
    h.deps.provider.start = async () => { throw new Error("socket hang up"); };
    await expect(ensureComputer(USER, h.deps)).rejects.toThrow("socket hang up");
    expect(h.row()).toMatchObject({ state: "error", error: "socket hang up" });
  });
});

describe("stopComputer", () => {
  it("stops once and charges the time it was on, with an idempotent key", async () => {
    const h = harness({ providerId: "sbx", state: "on", onSince: new Date(1_000_000) });
    h.tick(10 * 60_000);
    await stopComputer(h.row(), h.deps);
    await stopComputer(h.row(), h.deps);
    expect(h.calls.filter((c) => c === "stop")).toHaveLength(1);
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0]).toMatchObject({ seconds: 600, key: "computer:c1:1000000" });
    expect(h.recorded[0]!.costMicros).toBe(5_520 * 10);
    expect(h.row()).toMatchObject({ state: "off", onSince: null, controller: "mate" });
  });
});

describe("sweepComputers", () => {
  it("stops a desktop idle past the limit, but never one with a live goal", async () => {
    const h = harness({ providerId: "sbx", state: "on", onSince: new Date(1_000_000), lastActiveAt: new Date(1_000_000) });
    h.addGoal("running");
    h.tick(IDLE_STOP_MS + 1);
    expect(await sweepComputers(h.deps)).toBe(0);
    h.goals.get("g1")!.status = "done";
    expect(await sweepComputers(h.deps)).toBe(1);
    expect(h.row().state).toBe("off");
  });

  it("leaves a recently active desktop on", async () => {
    const h = harness({ providerId: "sbx", state: "on", lastActiveAt: new Date(1_000_000) });
    h.tick(IDLE_STOP_MS - 1);
    expect(await sweepComputers(h.deps)).toBe(0);
  });
});

describe("take over and hand back", () => {
  it("gives the user the mouse, pauses the running goal, and serves an interactive link", async () => {
    const h = harness({ providerId: "sbx", state: "on" });
    h.addGoal("running");
    const view = await takeOver(USER, h.deps);
    expect(view.controller).toBe("user");
    expect(view.liveUrl).toBe("https://live/control");
    expect(h.goals.get("g1")).toMatchObject({ status: "waiting", waitingFor: "user_control" });
  });

  it("hands back, resumes the goal and returns to a view-only link", async () => {
    const h = harness({ providerId: "sbx", state: "on", controller: "user" });
    h.addGoal("waiting", "user_control");
    const view = await handBack(USER, h.deps);
    expect(view.controller).toBe("mate");
    expect(view.liveUrl).toBe("https://live/view");
    expect(h.goals.get("g1")).toMatchObject({ status: "running", waitingFor: null, reply: "handback" });
  });

  it("won't take over a computer that is off", async () => {
    const h = harness({ state: "off" });
    await expect(takeOver(USER, h.deps)).rejects.toThrow(/off/);
  });
});

describe("computerView", () => {
  it("is view-only while a mate drives, and marks that someone is watching", async () => {
    const h = harness({ providerId: "sbx", state: "on" });
    const view = await computerView(USER, h.deps);
    expect(view.liveUrl).toBe("https://live/view");
    expect(h.row().lastViewedAt?.getTime()).toBe(1_000_000);
  });

  it("reuses a live link while it has time left", async () => {
    const h = harness({ providerId: "sbx", state: "on" });
    await computerView(USER, h.deps);
    h.tick(60_000);
    await computerView(USER, h.deps);
    expect(h.calls.filter((c) => c.startsWith("url:"))).toHaveLength(1);
  });

  it("has no link while the computer is off", async () => {
    const h = harness({ providerId: "sbx", state: "off" });
    expect((await computerView(USER, h.deps)).liveUrl).toBeNull();
  });
});

describe("computerInput", () => {
  it("refuses to type unless the user has taken over", async () => {
    const h = harness({ providerId: "sbx", state: "on", controller: "mate" });
    await expect(computerInput(USER, { text: "hunter2" }, h.deps)).rejects.toThrow(/Take over/);
    expect(h.typed).toEqual([]);
  });

  it("types straight into the desktop and stores nothing", async () => {
    const h = harness({ providerId: "sbx", state: "on", controller: "user" });
    await computerInput(USER, { text: "hunter2", key: "Enter" }, h.deps);
    expect(h.typed).toEqual(["hunter2", "<enter>"]);
    expect(JSON.stringify([...h.rows.values()])).not.toContain("hunter2");
  });
});
