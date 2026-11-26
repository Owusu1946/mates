import assert from "node:assert/strict";
import { test } from "node:test";
import { readRunStreamEvents } from "./runStream.ts";

const event = (sequence, type = "progress", payload = { status: "running" }) => ({
  version: 1,
  sequence,
  type,
  timestamp: "2026-11-18T12:00:00.000Z",
  payload,
});

function streamFromBytes(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

test("parses replayable events across split UTF-8 and SSE frame boundaries", async () => {
  const first = event(1, "progress", { status: "running", text: "héllo 👋" });
  const second = event(2, "run.completed", { status: "completed" });
  const wire = `id: 1\nevent: progress\ndata: ${JSON.stringify(first)}\n\n: keep-alive\n\nid: 2\nevent: run.completed\ndata: ${JSON.stringify(second)}\n\n`;
  const bytes = new TextEncoder().encode(wire);
  const chunks = [bytes.slice(0, 19), bytes.slice(19, 73), bytes.slice(73, 120), bytes.slice(120, 141), bytes.slice(141)];
  const parsed = [];
  for await (const value of readRunStreamEvents(streamFromBytes(chunks))) parsed.push(value);
  assert.deepEqual(parsed, [first, second]);
});

test("rejects malformed events and mismatched SSE cursors", async () => {
  const invalid = `id: 2\ndata: ${JSON.stringify(event(1))}\n\n`;
  await assert.rejects(async () => {
    for await (const _ of readRunStreamEvents(streamFromBytes([new TextEncoder().encode(invalid)]))) { /* consume */ }
  }, /invalid event/i);
});

test("cancels the SSE reader when the chat transport is explicitly stopped or detached", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const controller = new AbortController();
  const iterator = readRunStreamEvents(stream, controller.signal);
  const next = iterator.next();
  controller.abort();
  assert.equal((await next).done, true);
  assert.equal(cancelled, true);
});
