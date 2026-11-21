import { describe, expect, it, vi } from "vitest";
import {
  computerInput, computerView, ensureComputer, handBack, IDLE_STOP_MS, MAX_ON_MS, START_STALE_MS, startFromApp, stopComputer, stopFromApp, sweepComputers, takeOver,
  type Computer, type ComputerDeps, type ComputerGoal, type DesktopProvider,
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
  const providerState = { value: "started" as string | undefined };
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
      idleSince: async (before, onBefore) => [...rows.values()].filter((r) => r.state === "on"
        && (((r.lastActiveAt ?? r.updatedAt) < before && (r.lastViewedAt ?? r.updatedAt) < before) || (!!r.onSince && r.onSince < onBefore))
        && ![...goals.values()].some((g) => g.computerId === r.id && ["running", "waiting"].includes(g.status))),
    },
    active: "daytona",
    providers: {
      daytona: {
      create: async () => { calls.push("create"); return { providerId: sbx, snapshot: "mates-desktop-1" }; },
      start: async () => { calls.push("start"); return desktop; },
      attach: async () => desktop,
      stop: async () => { calls.push("stop"); },
      liveUrl: async (_id, viewOnly) => { calls.push(viewOnly ? "url:view" : "url:control"); return { url: `https://live/${viewOnly ? "view" : "control"}`, token: "t", expiresAt: clock + 600_000 }; },
      expireLiveUrl: async () => { calls.push("expire"); },
      state: async () => { calls.push("state"); return providerState.value; },
      keepAlive: async () => { calls.push("keepalive"); },
      isGone: (error) => error instanceof Error && error.message === "gone",
      delete: async () => { calls.push("delete"); },
      error: (error) => (error instanceof Error && error.message.length < 200 ? error.message : "The computer couldn't be reached."),
      configured: () => true,
      },
      // The other service: records its calls with a prefix, for the switch.
      e2b: {
        create: async () => { calls.push("e2b:create"); return { providerId: "e2b-sbx", snapshot: "mates-desktop-v1" }; },
        start: async () => { calls.push("e2b:start"); return desktop; },
        attach: async () => desktop,
        stop: async () => { calls.push("e2b:stop"); },
        liveUrl: async (_id, viewOnly) => { calls.push(viewOnly ? "e2b:url:view" : "e2b:url:control"); return { url: `https://e2b/${viewOnly ? "view" : "control"}`, token: "t", expiresAt: clock + 600_000 }; },
        expireLiveUrl: async () => { calls.push("e2b:expire"); },
        state: async () => { calls.push("e2b:state"); return providerState.value; },
        keepAlive: async () => { calls.push("e2b:keepalive"); },
        isGone: () => false,
        delete: async () => { calls.push("e2b:delete"); },
        error: () => "The computer service had a problem. Try again in a minute.",
        configured: () => true,
      } satisfies DesktopProvider,
    },
  };
  const addGoal = (status: ComputerGoal["status"], waitingFor: ComputerGoal["waitingFor"] = null) => {
    const goal = { id: "g1", computerId: "c1", clerkUserId: USER, status, waitingFor, steps: [], goal: "Make a table", mateId: null, question: null, chatId: null } as unknown as ComputerGoal;
    goals.set(goal.id, goal);
  };
  return { deps, rows, goals, calls, typed, recorded, addGoal, providerState, tick: (ms: number) => { clock += ms; }, row: () => rows.get("c1")! };
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
    h.deps.providers.daytona.start = async () => { throw new Error("socket hang up"); };
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
    h.addGoal("running");
    const view = await computerView(USER, h.deps, { watching: true });
    expect(view.liveUrl).toBe("https://live/view");
    expect(h.row().lastViewedAt?.getTime()).toBe(1_000_000);
  });

  it("gives the user the mouse whenever no task is on it", async () => {
    const h = harness({ providerId: "sbx", state: "on", controller: "mate" });
    const view = await computerView(USER, h.deps);
    expect(view).toMatchObject({ controller: "user", liveUrl: "https://live/control" });
  });

  it("only counts as watching when the live view is on screen", async () => {
    const h = harness({ providerId: "sbx", state: "on" });
    await computerView(USER, h.deps);
    expect(h.row().lastViewedAt).toBeNull();
  });

  it("keeps a watched desktop alive on Daytona, at most once a minute", async () => {
    const h = harness({ providerId: "sbx", state: "on" });
    await computerView(USER, h.deps, { watching: true });
    await computerView(USER, h.deps, { watching: true });
    expect(h.calls.filter((c) => c === "keepalive")).toHaveLength(1);
  });

  it("notices a desktop Daytona stopped behind our back, and charges its time", async () => {
    const h = harness({ providerId: "sbx", state: "on", onSince: new Date(1_000_000) });
    h.providerState.value = "stopped";
    h.tick(120_000);
    const view = await computerView(USER, h.deps, { watching: true });
    expect(view.state).toBe("off");
    expect(view.liveUrl).toBeNull();
    expect(h.recorded).toHaveLength(1);
  });

  it("forgets a desktop that was deleted, so the next start makes a new one", async () => {
    const h = harness({ providerId: "sbx", state: "on", onSince: new Date(1_000_000) });
    h.providerState.value = "gone";
    const view = await computerView(USER, h.deps, { watching: true });
    expect(view.state).toBe("off");
    expect(h.row().providerId).toBeNull();
  });

  it("picks up a start whose process died", async () => {
    const h = harness({ providerId: "sbx", state: "starting", updatedAt: new Date(1_000_000) });
    h.tick(START_STALE_MS + 1);
    await computerView(USER, h.deps);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.calls).toContain("start");
    expect(h.row().state).toBe("on");
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
    h.addGoal("running");
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

describe("startFromApp", () => {
  it("answers at once with the computer starting, gives the user the mouse, and comes on in the background", async () => {
    const h = harness();
    const view = await startFromApp(USER, h.deps);
    expect(view).toMatchObject({ state: "starting", controller: "user", setup: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.calls).toEqual(["create", "start"]);
    expect(h.row()).toMatchObject({ state: "on", controller: "user" });
  });

  it("shares one start between a tap and a mate's goal", async () => {
    const h = harness({ providerId: "sbx" });
    await Promise.all([startFromApp(USER, h.deps), ensureComputer(USER, h.deps)]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.calls.filter((c) => c === "start")).toHaveLength(1);
  });

  it("leaves the mouse with a mate that is mid-task", async () => {
    const h = harness({ providerId: "sbx", state: "on", controller: "mate" });
    h.addGoal("running");
    const view = await startFromApp(USER, h.deps);
    expect(view.controller).toBe("mate");
  });

  it("makes a new desktop when the old one was deleted on Daytona", async () => {
    const h = harness({ providerId: "sbx", state: "off" });
    let first = true;
    h.deps.providers.daytona.start = async () => { h.calls.push("start"); if (first) { first = false; throw new Error("gone"); } return {} as Desktop; };
    const { computer } = await ensureComputer(USER, h.deps);
    expect(h.calls).toEqual(["start", "create", "start"]);
    expect(computer.state).toBe("on");
  });
});

describe("stopFromApp", () => {
  it("cancels the task and turns the computer off straight away", async () => {
    const h = harness({ providerId: "sbx", state: "on", onSince: new Date(1_000_000) });
    h.addGoal("running");
    const view = await stopFromApp(USER, h.deps);
    expect(h.goals.get("g1")).toMatchObject({ cancelRequested: true });
    expect(h.calls).toContain("stop");
    expect(view.state).toBe("off");
  });
});

describe("sweeping a desktop in use", () => {
  it("keeps a desktop on while its live view is open, up to the cap", async () => {
    const h = harness({ providerId: "sbx", state: "on", onSince: new Date(1_000_000), lastActiveAt: new Date(1_000_000) });
    h.tick(IDLE_STOP_MS + 1);
    h.row().lastViewedAt = new Date(1_000_000 + IDLE_STOP_MS);
    expect(await sweepComputers(h.deps)).toBe(0);
    h.tick(MAX_ON_MS);
    h.row().lastViewedAt = new Date(1_000_000 + IDLE_STOP_MS + MAX_ON_MS);
    expect(await sweepComputers(h.deps)).toBe(1);
  });
});

describe("hand back with no task", () => {
  it("keeps the mouse with the user", async () => {
    const h = harness({ providerId: "sbx", state: "on", controller: "user" });
    const view = await handBack(USER, h.deps);
    expect(view.controller).toBe("user");
  });
});

describe("switching providers", () => {
  it("changes nothing while the setting stays on Daytona", async () => {
    const h = harness({ providerId: "sbx", state: "off" });
    await ensureComputer(USER, h.deps);
    expect(h.calls).toEqual(["start"]);
    expect(h.row().provider).toBe("daytona");
  });

  it("makes new desktops on the active service", async () => {
    const h = harness();
    h.deps.active = "e2b";
    const { computer } = await ensureComputer(USER, h.deps);
    expect(h.calls).toEqual(["e2b:create", "e2b:start"]);
    expect(computer).toMatchObject({ provider: "e2b", providerId: "e2b-sbx", snapshot: "mates-desktop-v1", state: "on" });
  });

  it("moves a Daytona desktop on its next start: the old one is deleted, a new one made", async () => {
    const h = harness({ providerId: "sbx", state: "off" });
    h.deps.active = "e2b";
    await ensureComputer(USER, h.deps);
    expect(h.calls).toEqual(["delete", "e2b:create", "e2b:start"]);
    expect(h.row()).toMatchObject({ provider: "e2b", providerId: "e2b-sbx", state: "on" });
  });

  it("still moves when the old desktop can't be deleted", async () => {
    const h = harness({ providerId: "sbx", state: "off" });
    h.deps.active = "e2b";
    h.deps.providers.daytona.delete = async () => { throw new Error("daytona is down"); };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await ensureComputer(USER, h.deps);
    warn.mockRestore();
    expect(h.calls).toEqual(["e2b:create", "e2b:start"]);
    expect(h.row()).toMatchObject({ provider: "e2b", state: "on" });
  });

  it("keeps using a computer's own service until it moves", async () => {
    // On Daytona and on; the setting changed to E2B meanwhile. Stopping, the live view and typing
    // all go to Daytona, where the desktop actually is.
    const h = harness({ providerId: "sbx", state: "on", controller: "user", onSince: new Date(999_000) });
    h.deps.active = "e2b";
    await computerView(USER, h.deps, { watching: true });
    await computerInput(USER, { text: "hi" }, h.deps);
    await stopComputer(h.row(), h.deps);
    expect(h.calls.filter((call) => call.startsWith("e2b:"))).toEqual([]);
    expect(h.calls).toEqual(expect.arrayContaining(["state", "url:control", "stop"]));
    expect(h.recorded).toHaveLength(1);
  });
});
