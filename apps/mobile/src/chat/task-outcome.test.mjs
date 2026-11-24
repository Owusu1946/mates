import assert from "node:assert/strict";
import { test } from "node:test";
import { codeOutcome, computerOutcome } from "./task-outcome.ts";

const code = { status: "done", checks: [] };
const pr = { number: 1, title: "Change", url: "https://github.com/example/repo/pull/1" };

test("failure and cancellation take precedence over an existing PR or checks", () => {
  assert.equal(codeOutcome({ ...code, status: "failed", pr }), "Couldn’t finish");
  assert.equal(codeOutcome({ ...code, status: "cancelled", pr: { ...pr, draft: true } }), "Stopped");
});
test("completed code distinguishes draft, failed checks, warnings and reviewable work", () => {
  assert.equal(codeOutcome({ ...code, pr }), "Ready for review");
  assert.equal(codeOutcome({ ...code, pr: { ...pr, draft: true } }), "Draft pull request");
  assert.equal(codeOutcome({ ...code, pr, checks: [{ passed: false }] }), "Checks need attention");
  assert.equal(codeOutcome({ ...code, pr, notes: [{ kind: "out_of_time", text: "Time limit" }] }), "Completed with warnings");
  assert.equal(codeOutcome(code), "Completed");
});
test("computer outcomes identify what the user needs to do", () => {
  const expected = {
    approval: "Your approval is needed",
    login: "Sign in to continue",
    question: "Your answer is needed",
    user_control: "You have control",
  };
  for (const [waitingFor, label] of Object.entries(expected)) {
    assert.equal(computerOutcome({ status: "waiting", waitingFor }), label);
  }
  assert.equal(computerOutcome({ status: "waiting" }), "Needs your input");
  assert.equal(computerOutcome({ status: "running" }), null);
  assert.equal(computerOutcome({ status: "failed" }), "Couldn’t finish");
  assert.equal(computerOutcome({ status: "cancelled" }), "Stopped");
  assert.equal(computerOutcome({ status: "done" }), "Completed");
});
