import assert from "node:assert/strict";
import { test } from "node:test";
import { appState, joinPages, logoSrc, sortApps, usableApps, type AppConnection } from "./apps.logic.ts";

const app = (slug: string, change: Partial<AppConnection> = {}): AppConnection => ({ slug, name: slug[0]!.toUpperCase() + slug.slice(1), connected: false, noAuth: false, status: "INACTIVE", ...change });
const APPS = [
  app("notion"),
  app("gmail", { connected: true, status: "ACTIVE" }),
  app("weather", { noAuth: true, status: "ACTIVE" }),
  app("calendar", { status: "EXPIRED" }),
  app("slack", { status: "INITIATED" }),
];

test("each app's state, from Composio's status", () => {
  assert.deepEqual(APPS.map((one) => appState(one)), ["available", "connected", "ready", "reconnect", "available"]);
});

test("connecting is only while this app waits on your browser", () => {
  assert.equal(appState(app("slack"), true), "connecting");
  assert.equal(appState(app("gmail", { connected: true, status: "ACTIVE" }), true), "connected");
});

test("what needs you comes first, then the API's order", () => {
  assert.deepEqual(sortApps(APPS).map((one) => one.slug), ["calendar", "gmail", "weather", "notion", "slack"]);
});

test("pages join without repeats", () => {
  assert.deepEqual(joinPages([{ apps: [app("a"), app("b")] }, { apps: [app("b"), app("c")] }]).map((one) => one.slug), ["a", "b", "c"]);
});

test("a mate can use what's connected or needs no sign-in", () => {
  assert.deepEqual(usableApps(APPS).map((one) => one.slug), ["gmail", "weather"]);
});

test("logos load through the app, https only", () => {
  assert.equal(logoSrc("https://logos.composio.dev/api/gmail"), "mates://app/logo?src=https%3A%2F%2Flogos.composio.dev%2Fapi%2Fgmail");
  assert.equal(logoSrc("http://x.com/a.png"), undefined);
  assert.equal(logoSrc(undefined), undefined);
});
