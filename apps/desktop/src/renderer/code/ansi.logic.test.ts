import assert from "node:assert/strict";
import { test } from "node:test";
import { ansiSpans } from "./ansi.logic.ts";

test("command output keeps its colours as spans", () => {
  const spans = ansiSpans("\u001b[1;32mPASS\u001b[0m done \u001b[2m(41 ms)\u001b[0m");
  assert.deepEqual(spans, [
    { text: "PASS", tone: "green", bold: true },
    { text: " done ", tone: null, bold: false },
    { text: "(41 ms)", tone: "dim", bold: false },
  ]);
  assert.deepEqual(ansiSpans("plain"), [{ text: "plain", tone: null, bold: false }]);
});
