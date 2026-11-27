import assert from "node:assert/strict";
import { test } from "node:test";
import type { Card } from "../../data/sampleCrew.ts";
import { allConnected, awaitsAnswer, choiceFor, isConnectUrl, shownStatus } from "./cardAnswers.logic.ts";

test("each answer is the choice the API reads", () => {
  assert.equal(choiceFor({ type: "approve" }).choice, "approve");
  assert.equal(choiceFor({ type: "always" }).choice, "always");
  assert.equal(choiceFor({ type: "decline" }).choice, "decline");
  assert.equal(choiceFor({ type: "choose", optionId: "acc_2" }).choice, "acc_2");
  assert.equal(choiceFor({ type: "plan", actionIds: ["a1", "a3"] }).choice, "approve:a1,a3");
  assert.equal(choiceFor({ type: "planDecline" }).choice, "decline");
  assert.equal(choiceFor({ type: "decline" }).pending, "Leaving it…");
});

test("a card waits while it's open, in review, or not yet connected", () => {
  const approval = { type: "approval", title: "", detail: "", meta: "", allow: "Allow", state: "open" } as const;
  assert.equal(awaitsAnswer(approval), true);
  assert.equal(awaitsAnswer({ ...approval, state: "allowed" }), false);
  assert.equal(awaitsAnswer({ type: "plan", title: "", state: "review", actions: [] }), true);
  assert.equal(awaitsAnswer({ type: "plan", title: "", state: "running", actions: [] }), false);
  assert.equal(awaitsAnswer({ type: "connect", app: { slug: "gmail", name: "Gmail" }, reason: "", state: "needed" }), true);
  assert.equal(awaitsAnswer({ type: "memory", text: "", action: "saved" }), false);
});

test("an answer in flight shows only while the card still waits", () => {
  const open: Card = { type: "choice", title: "", options: [], state: "open" };
  assert.deepEqual(shownStatus(open, { pending: "Carrying on…" }), { pending: "Carrying on…" });
  assert.equal(shownStatus({ type: "choice", title: "", options: [], state: "done" }, { pending: "Carrying on…" }), undefined);
  assert.equal(shownStatus(open, undefined), undefined);
});

test("a reply that needs several apps carries on once the last is connected", () => {
  assert.equal(allConnected(new Set(["gmail"]), ["gmail", "googlecalendar"]), false);
  assert.equal(allConnected(new Set(["gmail", "googlecalendar"]), ["gmail", "googlecalendar"]), true);
  assert.equal(allConnected(new Set(), []), true);
});

test("connect links come only from the sign-in service", () => {
  assert.equal(isConnectUrl("https://connect.composio.dev/link/abc"), true);
  assert.equal(isConnectUrl("https://connect.composio.ai/x"), true);
  assert.equal(isConnectUrl("https://evil.example/connect.composio.dev/"), false);
  assert.equal(isConnectUrl("http://connect.composio.dev/x"), false);
  assert.equal(isConnectUrl(null), false);
});
