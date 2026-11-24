import assert from "node:assert/strict";
import { test } from "node:test";
import { computerReducer, goalOf, hasWork, initialComputer, liveGoal, queuedGoals, type ComputerAction, type ComputerState, type ScreenStep } from "./computer.logic.ts";

const steps: ScreenStep[] = [
  { id: "a", label: "Opening bolt.com", screen: "home", cursor: { x: 10, y: 10 } },
  { id: "b", label: "Paying", screen: "pay", cursor: { x: 50, y: 50 }, needs: { kind: "approval", title: "Pay GH¢38?", detail: "" } },
];
const login: ScreenStep[] = [{ id: "l", label: "Sign in", screen: "login", cursor: { x: 50, y: 50 }, needs: { kind: "login", title: "Sign in to Booking.com", detail: "" } }];
const run = (state: ComputerState, ...actions: ComputerAction[]) => actions.reduce(computerReducer, state);
const ask = (mateId: string, goalSteps = steps): ComputerAction => ({ type: "ask", goal: { id: `g-${mateId}`, mateId, title: "Task", steps: goalSteps } });

test("asking turns the computer on, and the goal starts once it's on", () => {
  let state = run(initialComputer(), ask("kofi"));
  assert.equal(state.power, "starting");
  assert.equal(hasWork(state), false, "nothing runs while it boots");
  state = run(state, { type: "booted" }, { type: "advance" });
  assert.equal(liveGoal(state)?.mateId, "kofi");
});

test("one mouse: a second mate's goal waits in line, then runs when the first is done", () => {
  let state = run(initialComputer(), ask("kofi", [steps[0]!]), ask("esi"), { type: "booted" }, { type: "advance" });
  assert.equal(liveGoal(state)?.mateId, "kofi");
  assert.deepEqual(queuedGoals(state).map((goal) => goal.mateId), ["esi"]);
  assert.equal(run(state, ask("esi")).goals.length, 2, "a mate has one goal in play at a time");
  state = run(state, { type: "advance" }, { type: "advance" }, { type: "advance" });
  assert.equal(liveGoal(state)?.mateId, "esi");
  assert.equal(state.goals[0]!.status, "done");
});

test("a payment waits for your OK; not now cancels it", () => {
  const waiting = run(initialComputer(), ask("kofi"), { type: "booted" }, { type: "advance" }, { type: "advance" }, { type: "advance" });
  assert.equal(liveGoal(waiting)?.waitingFor, "approval");
  assert.equal(hasWork(waiting), false);
  assert.equal(liveGoal(run(waiting, { type: "answer", allow: true }))?.status, "running");
  assert.equal(goalOf(run(waiting, { type: "answer", allow: false }), "kofi"), null);
});

test("taking over holds the mate; signing in yourself and handing back carries on", () => {
  const waiting = run(initialComputer(), ask("esi", login), { type: "booted" }, { type: "advance" }, { type: "advance" });
  assert.equal(liveGoal(waiting)?.waitingFor, "login");
  const driving = run(waiting, { type: "takeOver" });
  assert.equal(driving.controller, "user");
  const back = run(driving, { type: "handBack" });
  assert.equal(back.controller, "mate");
  assert.equal(liveGoal(back)?.status, "running");
});

test("turning off ends the job in hand and keeps the line; it won't take over while off", () => {
  const busy = run(initialComputer(), ask("kofi"), ask("esi"), { type: "booted" }, { type: "advance" });
  const off = run(busy, { type: "turnOff" }, { type: "stopped" });
  assert.equal(off.power, "off");
  assert.equal(off.goals[0]!.status, "cancelled");
  assert.equal(off.goals[1]!.status, "queued");
  assert.equal(run(initialComputer(), { type: "takeOver" }).controller, "mate");
  assert.deepEqual(run(busy, { type: "place", place: "thisPC" }), initialComputer("thisPC"));
});
