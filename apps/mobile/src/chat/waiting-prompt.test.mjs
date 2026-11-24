import assert from "node:assert/strict";
import { test } from "node:test";
import { findWaitingPrompt } from "./waiting-prompt.ts";

const message = (...cards) => [{
  role: "assistant",
  index: 4,
  content: cards.map((result) => ({ type: "tool-call", result })),
}];

test("finds an actionable card on the latest assistant message", () => {
  assert.deepEqual(findWaitingPrompt(message({ kind: "connection", phase: "waiting", name: "Google Calendar" }), false), {
    messageIndex: 4,
    label: "Connect Google Calendar",
  });
  assert.equal(findWaitingPrompt(message({ kind: "approval", phase: "waiting" }), false)?.label, "Approve or decline an action");
  assert.equal(findWaitingPrompt(message({ kind: "plan", phase: "waiting" }), false)?.label, "Review the plan");
  assert.equal(findWaitingPrompt(message({ kind: "computer", computer: { status: "waiting", waitingFor: "login" } }), false)?.label, "Sign in to continue");
  assert.equal(findWaitingPrompt(message({ kind: "browser", phase: "waiting", browserStatus: "verification" }), false)?.label, "Complete website verification");
});

test("does not surface resolved, historical, user-authored or actively running work", () => {
  assert.equal(findWaitingPrompt(message({ kind: "approval", phase: "waiting", approval: { choice: "allow" } }), false), null);
  assert.equal(findWaitingPrompt(message({ kind: "approval", phase: "done" }), false), null);
  assert.equal(findWaitingPrompt([
    ...message({ kind: "approval", phase: "waiting" }),
    { role: "user", index: 5, content: [] },
  ], false), null);
  assert.equal(findWaitingPrompt(message({ kind: "approval", phase: "waiting" }), true), null);
});

test("uses the most recent actionable card when a reply has multiple waiting cards", () => {
  assert.equal(findWaitingPrompt(message(
    { kind: "connection", phase: "waiting", name: "Gmail" },
    { kind: "choice", phase: "waiting" },
  ), false)?.label, "Choose an app");
});
