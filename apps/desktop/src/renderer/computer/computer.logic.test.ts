import assert from "node:assert/strict";
import { test } from "node:test";
import { computerReducer, initialComputer, isRunning, type ComputerState, type ScreenStep } from "./computer.logic.ts";

const steps: ScreenStep[] = [
  { id: "a", label: "Opening bolt.com", screen: "home", cursor: { x: 10, y: 10 } },
  { id: "b", label: "Paying", screen: "pay", cursor: { x: 50, y: 50 }, approval: { title: "Pay GH¢38?", detail: "" } },
  { id: "c", label: "Booked", screen: "done", cursor: { x: 60, y: 60 } },
];
const run = (state: ComputerState, ...actions: Parameters<typeof computerReducer>[1][]) => actions.reduce(computerReducer, state);

test("it wakes, starts, then works through its steps", () => {
  let state = run(initialComputer(), { type: "wake" });
  assert.equal(state.power, "starting");
  state = run(state, { type: "started" }, { type: "advance", steps });
  assert.equal(state.shown, 1);
  assert.equal(isRunning(state), true);
});

test("a payment waits for your OK; allowing carries on, not now stops", () => {
  const waiting = run(initialComputer(), { type: "wake" }, { type: "started" }, { type: "advance", steps }, { type: "advance", steps });
  assert.equal(waiting.waitingOn, "b");
  assert.equal(run(waiting, { type: "advance", steps }), waiting, "nothing happens while it waits");
  const allowed = run(waiting, { type: "answer", allow: true }, { type: "advance", steps }, { type: "advance", steps });
  assert.equal(allowed.power, "done");
  assert.equal(allowed.shown, 3);
  assert.equal(run(waiting, { type: "answer", allow: false }).power, "done");
});

test("taking over holds the mate until you hand back; pausing and stopping work", () => {
  const working = run(initialComputer(), { type: "wake" }, { type: "started" });
  const driving = run(working, { type: "takeOver" });
  assert.equal(isRunning(driving), false);
  assert.equal(isRunning(run(driving, { type: "handBack" })), true);
  assert.equal(run(working, { type: "pause" }).power, "paused");
  assert.equal(run(working, { type: "pause" }, { type: "resume" }).power, "working");
  assert.deepEqual(run(working, { type: "stop" }), { ...initialComputer(), place: "cloud" });
});

test("with the computer off it won't wake, and moving place starts over", () => {
  assert.equal(run(initialComputer("off"), { type: "wake" }).power, "asleep");
  const moved = run(initialComputer(), { type: "wake" }, { type: "place", place: "thisPC" });
  assert.deepEqual(moved, initialComputer("thisPC"));
});
