import assert from "node:assert/strict";
import { test } from "node:test";
import type { Card } from "../../data/sampleCrew.ts";
import { advancePlan, memoryLabel, planSummary, sourcesPill, watchCadence } from "./cards.logic.ts";

const app = { slug: "gmail", name: "Gmail" };
const plan: Extract<Card, { type: "plan" }> = {
  type: "plan",
  title: "Book the dentist",
  state: "review",
  actions: [
    { id: "a", app, label: "Check Thursday", selected: true },
    { id: "b", app, label: "Book 10:30", selected: true },
    { id: "c", app, label: "Tell Kwesi", selected: false },
  ],
};

test("a plan says what's chosen, then runs only that, one step at a time", () => {
  assert.equal(planSummary(plan), "2 of 3 chosen");
  assert.equal(planSummary({ ...plan, actions: plan.actions.map((action) => ({ ...action, selected: true })) }), "3 things to do, with your OK");

  let running: typeof plan = { ...plan, state: "running" };
  assert.equal(planSummary(running), "Doing 1 of 2");
  running = advancePlan(running);
  assert.deepEqual(running.actions.map((action) => action.status), ["done", undefined, undefined]);
  assert.equal(planSummary(running), "Doing 2 of 2");
  running = advancePlan(advancePlan(running));
  assert.equal(running.state, "done");
  assert.deepEqual(running.actions.map((action) => action.status), ["done", "done", "skipped"]);
  assert.equal(planSummary(running), "Did 2 things");
  assert.equal(planSummary({ ...plan, state: "declined" }), "You said not now");
});

test("the sources pill shows up to four different sites", () => {
  const source = (id: string, domain: string) => ({ id, url: `https://${domain}`, title: id, domain });
  assert.deepEqual(sourcesPill([source("1", "a.com"), source("2", "a.com"), source("3", "b.com"), source("4", "c.com"), source("5", "d.com"), source("6", "e.com")]), { domains: ["a.com", "b.com", "c.com", "d.com"], label: "6 sources" });
  assert.equal(sourcesPill([source("1", "a.com")]).label, "1 source");
});

test("memory and watch lines read plainly", () => {
  assert.equal(memoryLabel({ type: "memory", text: "x", action: "updated" }), "Memory updated");
  assert.equal(memoryLabel({ type: "memory", text: "x", action: "saved", undone: true }), "Memory removed");
  const watch = { type: "watch" as const, title: "", condition: "", action: "", every: "every 4 hours", app: null, lastNote: null, lastChecked: null, status: "active" as const };
  assert.equal(watchCadence(watch), "Checks every 4 hours");
  assert.equal(watchCadence({ ...watch, every: null, app: "Gmail" }), "Waits for Gmail");
});
