import assert from "node:assert/strict";
import { test } from "node:test";
import { doneHeadline, planRows, withoutOwnZone } from "./plan-rows.ts";

const action = (id, over = {}) => ({ id, title: "Created an event", kind: "app", app: "Google Calendar", details: [], status: "done", ...over });
const event = (id, when) => action(id, { details: [{ label: "When", value: when }] });

test("a page shows its own name, with what was done underneath", () => {
  const [row] = planRows([action("a", { title: "Create notion page", app: "Notion", details: [{ label: "Title", value: "Frontend Development Study Plan — Kenneth" }] })], { group: true });
  assert.equal(row.primary, "Frontend Development Study Plan — Kenneth");
  assert.equal(row.secondary, "Create notion page");
});

test("repeated events fold into one row with their days and shared time", () => {
  const rows = planRows(
    [
      action("p", { title: "Create notion page", app: "Notion", details: [{ label: "Title", value: "Plan" }] }),
      event("e1", "Mon 16 Nov, 19:00–20:00 (Africa/Accra)"),
      event("e2", "Wed 18 Nov, 19:00–20:00 (Africa/Accra)"),
      event("e3", "Fri 20 Nov, 19:00–20:00 (Africa/Accra)"),
    ],
    { group: true, zone: "Africa/Accra" },
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[1].actions.length, 3);
  assert.equal(rows[1].primary, "Created 3 events");
  assert.equal(rows[1].secondary, "Mon 16, Wed 18, Fri 20 Nov · 19:00–20:00");
});

test("nothing is grouped while reviewing, or when outcomes differ", () => {
  const events = [event("e1", "Mon 16 Nov, 19:00–20:00"), event("e2", "Wed 18 Nov, 19:00–20:00")];
  assert.equal(planRows(events, { group: false }).length, 2);
  assert.equal(planRows([events[0], { ...events[1], status: "failed" }], { group: true }).length, 2);
});

test("the timezone stays when it isn't the person's own", () => {
  assert.equal(withoutOwnZone("Mon 16 Nov, 19:00–20:00 (Africa/Accra)", "Africa/Accra"), "Mon 16 Nov, 19:00–20:00");
  assert.equal(withoutOwnZone("Mon 16 Nov, 19:00–20:00 (Europe/London)", "Africa/Accra"), "Mon 16 Nov, 19:00–20:00 (Europe/London)");
});

test("the headline counts what got done", () => {
  assert.equal(doneHeadline([action("a"), action("b")]), "Did 2 things");
  assert.equal(doneHeadline([action("a"), action("b", { status: "failed" })]), "Did 1 of 2 things");
  assert.equal(doneHeadline([action("a")]), "Did 1 thing");
});
