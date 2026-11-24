import assert from "node:assert/strict";
import { test } from "node:test";
import type { Step } from "../data/sampleRuns.ts";
import { formatElapsed, groupIcon, groupSummary, stepIcon } from "./workGroup.logic.ts";

const s = (kind: Step["kind"]): Step => ({ id: kind, kind, label: kind, ms: 0 });

test("elapsed time reads 12s, 1m 05s, 1h 02m", () => {
  assert.equal(formatElapsed(12_400), "12s");
  assert.equal(formatElapsed(65_000), "1m 05s");
  assert.equal(formatElapsed(3_720_000), "1h 02m");
  assert.equal(formatElapsed(-5), "0s");
});

test("a folded group says what was done, and its icon follows the kind of step", () => {
  assert.equal(groupSummary([s("read"), s("read"), s("edit"), s("command")]), "read 2 files, edited 1, ran 1 command");
  assert.equal(groupSummary([s("edit"), s("edit")]), "edited 2 files");
  assert.equal(groupSummary([s("think")]), "");
  assert.equal(groupIcon([s("read"), s("read")]), "eye");
  assert.equal(groupIcon([s("read"), s("edit")]), "wrench");
  assert.equal(stepIcon("command"), "terminal");
});
