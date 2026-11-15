import assert from "node:assert/strict";
import { test } from "node:test";
import { groupActivity, headlineOf, stepsOf } from "./code-steps.ts";

const at = "2026-11-15T10:00:00Z";
const run = (status, lines, extra = {}) => ({
  runId: "r1",
  repo: "owner/app",
  branch: "mates/add-thing",
  status,
  checks: [],
  activity: lines.map((text) => ({ at, text })),
  ...extra,
});

test("groups setup, coding, the run's own checks and the pull request", () => {
  const groups = groupActivity([
    "Starting the computer",
    "Cloning owner/app",
    "Installing dependencies with pnpm",
    "Starting the coder",
    "Reading src/app.tsx",
    "Running pnpm test",
    "Editing src/app.tsx",
    "Running pnpm test",
    "pnpm test failed",
    "Fixing test (try 1 of 3)",
    "Editing src/app.tsx",
    "Running pnpm test",
    "pnpm test passed",
    "Pushing mates/add-thing",
    "Opening the pull request",
    "Opened PR #12",
  ]);
  assert.deepEqual(groups.setup, ["Starting the computer", "Cloning owner/app", "Installing dependencies with pnpm"]);
  // The coder's own "Running pnpm test" stays with coding; the run's check (followed by its result) moves.
  assert.deepEqual(groups.coding, ["Starting the coder", "Reading src/app.tsx", "Running pnpm test", "Editing src/app.tsx", "Fixing test (try 1 of 3)", "Editing src/app.tsx"]);
  assert.deepEqual(groups.checks, ["Running pnpm test", "pnpm test failed", "Running pnpm test", "pnpm test passed"]);
  assert.deepEqual(groups.pr, ["Pushing mates/add-thing", "Opening the pull request", "Opened PR #12"]);
});

test("the baseline check before coding counts as setup", () => {
  const groups = groupActivity(["Checking the project before changing it", "Running pnpm test", "pnpm test passed", "Starting the coder"]);
  assert.deepEqual(groups.setup, ["Checking the project before changing it", "Running pnpm test", "pnpm test passed"]);
  assert.deepEqual(groups.checks, []);
});

test("the headline is what's happening now, then how it ended", () => {
  assert.equal(headlineOf(run("queued", [])), "Waiting for the computer…");
  assert.equal(headlineOf(run("cloning", [])), "Setting up the computer…");
  assert.equal(headlineOf(run("coding", ["Starting the coder", "Editing src/app.tsx"])), "Editing src/app.tsx…");
  assert.equal(headlineOf(run("checking", ["Running pnpm test", "pnpm test passed"])), "Running checks…");
  assert.equal(headlineOf(run("done", [], { pr: { number: 12, url: "u", title: "Add dark mode" } })), "Opened PR #12 · Add dark mode");
  assert.equal(headlineOf(run("done", [], { pr: { number: 12, url: "u", title: "x", draft: true } })), "Opened draft PR #12 · needs attention");
  assert.equal(headlineOf(run("failed", [])), "Couldn’t finish");
  assert.equal(headlineOf(run("cancelled", [])), "Stopped");
});

test("step states follow the run", () => {
  const coding = stepsOf(run("coding", ["Starting the computer", "Starting the coder"]));
  assert.deepEqual(coding.map((s) => [s.id, s.state]), [["setup", "done"], ["coding", "current"], ["pr", "todo"]]);
  const checking = stepsOf(run("checking", ["Starting the coder"]));
  assert.ok(checking.some((s) => s.id === "checks" && s.state === "current"));
  const failed = stepsOf(run("failed", ["Starting the computer", "Starting the coder", "Editing a.ts"]));
  assert.deepEqual(failed.map((s) => [s.id, s.state]), [["setup", "done"], ["coding", "failed"], ["pr", "todo"]]);
  const done = stepsOf(run("done", ["Starting the coder", "Running pnpm test", "pnpm test passed"], { checks: [{ name: "test", command: "pnpm test", passed: true, output: "" }] }));
  assert.ok(done.every((s) => s.state === "done"));
  assert.ok(done.some((s) => s.id === "checks"));
});
