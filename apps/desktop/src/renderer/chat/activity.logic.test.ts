import assert from "node:assert/strict";
import { test } from "node:test";
import { activityIcon, activitySummary, workedFor } from "./activity.logic.ts";

test("a step's icon says what it's doing: searching, reading, or other work", () => {
  assert.equal(activityIcon('Searching for "kumasi hostels"'), "search");
  assert.equal(activityIcon("Reading 4 sources"), "eye");
  assert.equal(activityIcon("Reading lonelyplanet.com and booking.com"), "eye");
  assert.equal(activityIcon("Checking your inbox"), "wrench");
});

test("the summary counts searches and sources read", () => {
  assert.equal(activitySummary([{ label: 'Searching for "a"' }, { label: "Reading 4 sources" }, { label: 'Searching for "b"' }, { label: "Reading 2 sources" }]), "searched 2 times · read 6 sources");
  assert.equal(activitySummary([{ label: 'Searching for "a"' }, { label: "Reading 1 source" }]), "searched once · read 1 source");
  assert.equal(activitySummary([{ label: "Checking your inbox" }]), "");
});

test("how long it took, at least a second, and nothing without both times", () => {
  assert.equal(workedFor("2026-11-26T10:00:00Z", "2026-11-26T10:00:12Z"), "12s");
  assert.equal(workedFor("2026-11-26T10:00:00Z", "2026-11-26T10:00:00.200Z"), "1s");
  assert.equal(workedFor("2026-11-26T10:00:00Z", undefined), null);
});
