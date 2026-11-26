import assert from "node:assert/strict";
import { test } from "node:test";
import { delegationMessageIndex, notificationMessageIndex } from "./run-message-target.ts";

const message = (role, index, delegationId) => ({ role, index, metadata: { custom: { delegationId } } });

test("finds the assistant message belonging to a feed run", () => {
  const messages = [message("user", 0), message("assistant", 1, "run-a"), message("assistant", 2, "run-b")];
  assert.equal(delegationMessageIndex(messages, "run-a"), 1);
  assert.equal(delegationMessageIndex(messages, "run-b"), 2);
});

test("returns the loaded array position when the persisted message index differs", () => {
  const messages = [message("user", 18), message("assistant", 42, "run-a"), message("assistant", 43, "run-b")];
  assert.equal(delegationMessageIndex(messages, "run-a"), 1);
});

test("ignores user messages, unrelated history and missing run ids", () => {
  const messages = [message("user", 0, "run-a"), message("assistant", 1, "other-run")];
  assert.equal(delegationMessageIndex(messages, "run-a"), null);
  assert.equal(delegationMessageIndex(messages, undefined), null);
  assert.equal(delegationMessageIndex([], "run-a"), null);
});

test("finds a result message by id using its loaded array position", () => {
  const messages = [{ ...message("user", 40), id: "user_1" }, { ...message("assistant", 99), id: "code_1" }];
  assert.equal(notificationMessageIndex(messages, { messageId: "code_1" }), 1);
});

test("finds a deck card inside its parent run and handles a missing card", () => {
  const messages = [message("user", 0), { ...message("assistant", 47), content: [{ type: "tool-call", result: { kind: "deck", deck: { deckId: "deck_1" } } }] }];
  assert.equal(notificationMessageIndex(messages, { deckId: "deck_1" }), 1);
  assert.equal(notificationMessageIndex(messages, { deckId: "deck_2" }), null);
});

test("finds a waiting computer card before its final result message exists", () => {
  const messages = [message("user", 12), { ...message("assistant", 81), content: [{ type: "tool-call", result: { kind: "computer", computer: { goalId: "goal_1" } } }] }];
  assert.equal(notificationMessageIndex(messages, { computerGoalId: "goal_1" }), 1);
});
