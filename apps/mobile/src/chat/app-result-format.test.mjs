import assert from "node:assert/strict";
import { test } from "node:test";
import { appResultSubtitle } from "./app-result-format.ts";

test("formats ISO timestamps in app result metadata using local time", () => {
  const date = "2026-11-24T07:30:00.000Z";
  const expected = new Date(date).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  assert.equal(appResultSubtitle(`Alex · ${date}`), `Alex · ${expected}`);
});

test("keeps ordinary metadata and malformed timestamps intact", () => {
  assert.equal(appResultSubtitle("Alex · Tomorrow · 9:00 AM"), "Alex · Tomorrow · 9:00 AM");
  assert.equal(appResultSubtitle("Alex · 2026-11-24Tbad"), "Alex · 2026-11-24Tbad");
  assert.equal(appResultSubtitle(undefined), "");
});
