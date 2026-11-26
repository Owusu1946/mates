import assert from "node:assert/strict";
import { test } from "node:test";
import { applyRunEvent, applyRunSnapshot, retryDelay, settledContent, startProgress } from "./runProgress.ts";

const event = (sequence, payload, type = "progress") => ({ version: 1, sequence, type, timestamp: "2026-11-26T10:00:00Z", payload });
const text = (value) => ({ type: "text", text: value });

test("each event replaces the content: it carries the whole reply so far", () => {
  let progress = startProgress();
  progress = applyRunEvent(progress, event(1, { status: "running", content: [text("Look")] }));
  progress = applyRunEvent(progress, event(2, { status: "running", content: [text("Looking at Thursday")] }));
  assert.deepEqual(progress.content, [text("Looking at Thursday")]);
  assert.equal(progress.cursor, 2);
  assert.equal(progress.settled, false);
});

test("a replayed or older event changes nothing, so reconnecting never doubles text", () => {
  const progress = applyRunEvent(startProgress(), event(3, { status: "running", content: [text("abc")] }));
  assert.equal(applyRunEvent(progress, event(3, { status: "running", content: [text("abc")] })), progress);
  assert.equal(applyRunEvent(progress, event(2, { status: "running", content: [text("a")] })), progress);
});

test("an event without content keeps what's there; a settled status ends the run", () => {
  let progress = applyRunEvent(startProgress(), event(1, { status: "running", content: [text("Done soon")] }));
  progress = applyRunEvent(progress, event(2, { status: "completed" }, "run.completed"));
  assert.deepEqual(progress.content, [text("Done soon")]);
  assert.equal(progress.settled, true);
  assert.equal(applyRunEvent(startProgress(), event(1, { status: "waiting" })).settled, true);
  assert.equal(applyRunEvent(startProgress(), event(1, { status: "queued", handoff: "deadline" })).settled, false);
});

test("a polled snapshot follows the same cursor, and a failed run says why", () => {
  let progress = applyRunEvent(startProgress(), event(4, { status: "running", content: [text("Found 3")] }));
  assert.equal(applyRunSnapshot(progress, { sequence: 3, content: [], status: "running", error: null }), progress);
  progress = applyRunSnapshot(progress, { sequence: 5, content: [text("Found 3 hostels")], status: "failed", error: "The site was down." });
  assert.equal(progress.settled, true);
  assert.deepEqual(settledContent(progress), [text("Found 3 hostels"), text("The site was down.")]);
  assert.deepEqual(settledContent({ ...progress, status: "completed" }), [text("Found 3 hostels")]);
});

test("retries wait longer each time, up to a cap, with jitter", () => {
  assert.equal(retryDelay(0, { random: () => 0 }), 250);
  assert.equal(retryDelay(0, { random: () => 1 }), 500);
  assert.equal(retryDelay(3, { random: () => 1 }), 4000);
  assert.equal(retryDelay(20, { random: () => 1 }), 10_000);
  assert.equal(retryDelay(20, { random: () => 0 }), 5000);
});
