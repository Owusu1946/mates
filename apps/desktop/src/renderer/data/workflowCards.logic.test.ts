import assert from "node:assert/strict";
import { test } from "node:test";
import { cardsOf, toCard } from "./workflowCards.logic.ts";

const live = { stopped: false };
const part = (result: Record<string, unknown>) => ({ type: "tool-call", toolCallId: String(result.kind), toolName: "cooper_workflow", result });
const card = (kind: string, extra: Record<string, unknown> = {}) => ({ kind, phase: "done", label: kind, ...extra }) as Parameters<typeof toCard>[0];

test("the run's progress, web search included, is an activity with its steps and times", () => {
  const activity = toCard(card("step", { phase: "running", label: "Reading 4 sources", activity: [{ label: 'Searching for "kumasi hostels"', state: "done" }, { label: "Reading 4 sources", state: "running" }], startedAt: "2026-11-26T10:00:00Z" }), live);
  assert.deepEqual(activity, { type: "activity", label: "Reading 4 sources", steps: [{ label: 'Searching for "kumasi hostels"', done: true }, { label: "Reading 4 sources", done: false }], startedAt: "2026-11-26T10:00:00Z", finishedAt: undefined, state: "running" });
  assert.equal(toCard(card("step", { activity: [{ label: "Done", state: "done" }], finishedAt: "x" }), live)!.type, "activity");
});

test("the Starting placeholder and speaker labels show nothing", () => {
  assert.equal(toCard(card("step", { phase: "running", label: "Starting" }), live), null);
  assert.equal(toCard(card("speaker"), live), null);
});

test("anything still running in a stopped reply reads as stopped", () => {
  const stopped = toCard(card("step", { phase: "running", activity: [{ label: "Searching", state: "running" }] }), { stopped: true });
  assert.equal(stopped!.type === "activity" && stopped.state, "stopped");
  assert.equal(stopped!.type === "activity" && stopped.label, "Stopped");
  const summary = toCard(card("browser", { phase: "running" }), { stopped: true });
  assert.deepEqual(summary!.type === "summary" && [summary.title, summary.state], ["Stopped", "error"]);
});

test("an approval: open while waiting, its fields and targets, Always only when offered, and what you chose", () => {
  const open = toCard(card("approval", { phase: "waiting", label: "Send the email to Ama", name: "Gmail", resumeRunId: "r1", approval: { category: "send", targets: ["ama@x.gh"], canAlways: true, more: ["Reply to Kofi"] }, approvalFields: [{ label: "Subject", value: "Thursday" }] }), live);
  assert.ok(open?.type === "approval");
  assert.equal(open.state, "open");
  assert.equal(open.canAlways, true);
  assert.equal(open.resumeRunId, "r1");
  assert.deepEqual(open.fields, [{ label: "Subject", text: "Thursday" }]);
  assert.deepEqual(open.targets, ["ama@x.gh", "Reply to Kofi"]);
  assert.equal(open.meta, "Gmail · ama@x.gh");
  const declined = toCard(card("approval", { approval: { category: "spend", targets: [], canAlways: false, choice: "decline" } }), live);
  assert.equal(declined?.type === "approval" && declined.state, "skipped");
  const always = toCard(card("approval", { approval: { category: "send", targets: [], canAlways: true, choice: "always" } }), live);
  assert.equal(always?.type === "approval" && always.state, "allowed");
});

test("a choice, a plan and a connection carry the run they resume", () => {
  const choice = toCard(card("choice", { phase: "waiting", resumeRunId: "r2", options: [{ id: "acc_1", label: "Work Gmail", toolkit: "gmail" }] }), live);
  assert.deepEqual(choice?.type === "choice" && [choice.state, choice.options[0]!.id, choice.resumeRunId], ["open", "acc_1", "r2"]);
  const plan = toCard(card("plan", { phase: "waiting", resumeRunId: "r3", plan: { summary: "3 things for Thursday", actions: [{ id: "a1", title: "Book the dentist", app: "googlecalendar", details: [{ label: "When", value: "Thu 10:00" }], status: "proposed" }] } }), live);
  assert.ok(plan?.type === "plan");
  assert.deepEqual([plan.state, plan.title, plan.actions[0]!.detail, plan.actions[0]!.selected, plan.resumeRunId], ["review", "3 things for Thursday", "Thu 10:00", true, "r3"]);
  const connect = toCard(card("connection", { phase: "waiting", toolkit: "gmail", name: "Gmail", detail: "To read your inbox", resumeRunId: "r4" }), live);
  assert.deepEqual(connect, { type: "connect", app: { slug: "gmail", name: "Gmail" }, reason: "To read your inbox", state: "needed", resumeRunId: "r4" });
});

test("a plan that ran shows each action's outcome; one with nothing done was declined", () => {
  const ran = toCard(card("plan", { plan: { summary: "x", actions: [{ id: "a", title: "A", details: [], status: "done", undo: { kind: "app", id: "u1" } }, { id: "b", title: "B", details: [], status: "skipped" }] } }), live);
  assert.ok(ran?.type === "plan");
  assert.equal(ran.state, "done");
  assert.deepEqual(ran.actions.map((action) => [action.status, action.selected]), [["done", true], ["skipped", false]]);
  assert.deepEqual(ran.actions[0]!.undo, { kind: "app", id: "u1" });
  const declined = toCard(card("plan", { plan: { summary: "x", actions: [{ id: "a", title: "A", details: [], status: "skipped" }] } }), live);
  assert.equal(declined?.type === "plan" && declined.state, "declined");
});

test("sources keep their ids, favicons and dates; an empty list shows nothing", () => {
  const sources = toCard(card("sources", { sources: [{ id: "s1", url: "https://a.gh/x", title: "A", domain: "a.gh", publishedAt: "2026-11-20", favicon: "https://icons.duckduckgo.com/ip3/a.gh.ico" }] }), live);
  assert.ok(sources?.type === "sources");
  assert.equal(sources.sources[0]!.id, "s1");
  assert.equal(sources.sources[0]!.favicon, "https://icons.duckduckgo.com/ip3/a.gh.ico");
  assert.ok(sources.sources[0]!.published);
  assert.equal(toCard(card("sources", { sources: [] }), live), null);
});

test("memories, routines, watches, comparisons and code map to their cards", () => {
  assert.deepEqual(toCard(card("memory", { memory: { id: "m1", text: "Likes waakye", action: "saved" } }), live), { type: "memory", id: "m1", text: "Likes waakye", action: "saved" });
  const schedule = toCard(card("schedule", { label: "Morning brief", detail: "Weekdays at 7", routineId: "rt1", routineVersion: 2 }), live);
  assert.deepEqual(schedule?.type === "schedule" && [schedule.routineId, schedule.version, schedule.when], ["rt1", 2, "Weekdays at 7"]);
  const watch = toCard(card("watch", { watch: { watchId: "w1", version: 1, title: "Flights", condition: "under GH¢5k", action: "tell me", status: "expired", every: "every 4 hours", app: null, lastNote: null, lastCheckedAt: null } }), live);
  assert.deepEqual(watch?.type === "watch" && [watch.watchId, watch.status, watch.lastChecked], ["w1", "expired", null]);
  const comparison = toCard(card("comparison", { comparison: { suggestion: "Kumasi", perMate: [{ mate: { id: "esi", name: "Esi" }, recommendation: "Kumasi", basis: "cheaper" }], disagreements: [] } }), live);
  assert.equal(comparison?.type === "comparison" && comparison.perMate[0]!.mateId, "esi");
  const code = toCard(card("code", { code: { runId: "run1", repo: "mates", status: "done", pr: { number: 42, title: "Fix login", files: 3 } } }), live);
  assert.deepEqual(code, { type: "run", runId: "run1", title: "Fix login", project: "mates", files: 3, pr: 42 });
});

test("kinds the desktop can't act on yet say what they are, and send you to the phone when they need you", () => {
  const computer = toCard(card("computer", { phase: "waiting", computer: { goal: "Buy the charger", status: "waiting", question: "Approve the GH¢180 payment?" } }), live);
  assert.deepEqual(computer, { type: "summary", icon: "monitor", title: "Buy the charger", detail: "Approve the GH¢180 payment?", state: "waiting", onPhone: true });
  const deck = toCard(card("deck", { label: "Pitch deck ready" }), live);
  assert.deepEqual(deck?.type === "summary" && [deck.icon, deck.onPhone], ["file", false]);
});

test("a reply's cards come in order, skipping text and what shows nothing", () => {
  const cards = cardsOf([part(card("step", { activity: [{ label: "Searching", state: "done" }] })), { type: "text", text: "Here you go" }, part(card("speaker")), part(card("sources", { sources: [{ id: "s1", url: "https://a.gh", title: "A", domain: "a.gh", publishedAt: null }] }))], live);
  assert.deepEqual(cards.map((one) => one.type), ["activity", "sources"]);
  assert.deepEqual(cardsOf([{ type: "tool-call", result: null }, { type: "tool-call", result: { label: "no kind" } }], live), []);
});

test("web results don't also show as a list when the reply has its sources", () => {
  const web = part(card("results", { toolkit: "web", name: "web", label: "Latest Ghana news", items: [{ sourceId: "1", title: "Cocobod recalls fertiliser" }] }));
  const gmail = part(card("results", { toolkit: "gmail", name: "Gmail", label: "Emails that need you", items: [] }));
  const sources = part(card("sources", { sources: [{ id: "s1", url: "https://a.gh", title: "A", domain: "a.gh", publishedAt: null }] }));
  assert.deepEqual(cardsOf([web, gmail, sources], live).map((one) => one.type === "results" ? one.app.slug : one.type), ["gmail", "sources"]);
  // Without sources, the results are all there is: they show.
  assert.deepEqual(cardsOf([web], live).map((one) => one.type), ["results"]);
});
