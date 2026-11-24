import assert from "node:assert/strict";
import { test } from "node:test";
import { delegationMessageIndex } from "./run-message-target.ts";

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
