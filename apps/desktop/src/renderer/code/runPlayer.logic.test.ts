import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run } from "../data/sampleRuns.ts";
import { initialRuns, isPlaying, runsReducer, runStatus, type RunsState } from "./runPlayer.logic.ts";

const run: Run = {
  id: "r",
  repoId: "repo",
  title: "Fix",
  branch: "b",
  where: "this PC",
  items: [{ type: "message", id: "u", author: "me", text: "Fix it" }],
  script: [
    { type: "step", step: { id: "a", kind: "read", label: "Read", target: "x.ts", ms: 100 } },
    { type: "step", step: { id: "b", kind: "edit", label: "Edited", target: "x.ts", ms: 100, patchId: "p1" } },
    { type: "approval", id: "ok", command: "pnpm i", reason: "Installs", denied: "Skipped it." },
    { type: "step", step: { id: "c", kind: "command", label: "Ran", target: "pnpm test", ms: 100, outputId: "o1" } },
    { type: "message", text: "Done." },
    { type: "changes" },
  ],
  terminals: [{ id: "t", label: "Tests", outputIds: [] }],
  patchIds: [],
};

const play = (state: RunsState, times: number) => {
  let next = state;
  for (let i = 0; i < times; i++) next = runsReducer(next, { type: "advance", runId: "r", at: 1000 * (i + 1) });
  return next;
};

test("a fresh run waits to be opened, then plays steps into a live group", () => {
  const ready = initialRuns([run]);
  assert.equal(runStatus(ready.r!), "ready");
  assert.equal(play(ready, 1), ready, "nothing plays before it's opened");
  const started = play(runsReducer(ready, { type: "start", runId: "r", at: 0 }), 2);
  assert.equal(runStatus(started.r!), "working");
  assert.deepEqual(started.r!.live?.steps.map((step) => step.id), ["a"]);
  assert.equal(started.r!.live?.current?.id, "b");
  assert.deepEqual(started.r!.patchIds, ["p1"]);
});

test("an approval closes the group and waits; allowing carries on to the end", () => {
  const waiting = play(runsReducer(initialRuns([run]), { type: "start", runId: "r", at: 0 }), 3);
  assert.equal(runStatus(waiting.r!), "waiting");
  assert.equal(waiting.r!.live, null);
  assert.deepEqual(waiting.r!.items.map((item) => item.type), ["message", "work", "approval"]);
  assert.equal(play(waiting, 1), waiting, "nothing plays while it waits");

  const allowed = runsReducer(waiting, { type: "answer", runId: "r", approvalId: "ok", allow: true, at: 4000 });
  const done = play(allowed, 4);
  assert.deepEqual(done.r!.items.map((item) => item.type), ["message", "work", "approval", "work", "message", "changes"]);
  assert.deepEqual(done.r!.terminalOutput.t, ["o1"]);
  assert.equal(runStatus(done.r!), "done");
});

test("denying stops the run with the mate's reply", () => {
  const waiting = play(runsReducer(initialRuns([run]), { type: "start", runId: "r", at: 0 }), 3);
  const denied = runsReducer(waiting, { type: "answer", runId: "r", approvalId: "ok", allow: false, at: 4000 });
  assert.equal(denied.r!.items.at(-1)?.type, "message");
  assert.equal(isPlaying(denied.r!), false);
  const approval = denied.r!.items.find((item) => item.type === "approval");
  assert.equal(approval?.type === "approval" && approval.state, "denied");
});

test("stopping keeps what was done; a follow-up only starts once the run is idle", () => {
  const working = play(runsReducer(initialRuns([run]), { type: "start", runId: "r", at: 0 }), 2);
  const ignored = runsReducer(working, { type: "followUp", runId: "r", text: "and?", script: [], at: 2500 });
  assert.equal(ignored, working);
  const stopped = runsReducer(working, { type: "stop", runId: "r", at: 3000 });
  assert.equal(runStatus(stopped.r!), "done");
  const work = stopped.r!.items.at(-1);
  assert.equal(work?.type === "work" && work.durationMs, 2000);
  const followed = runsReducer(stopped, { type: "followUp", runId: "r", text: " and the docs? ", script: [{ type: "message", text: "Yes." }], at: 4000 });
  assert.equal(followed.r!.items.at(-1)?.type === "message" && followed.r!.items.at(-1)!.type, "message");
  assert.equal(runStatus(followed.r!), "working");
});
