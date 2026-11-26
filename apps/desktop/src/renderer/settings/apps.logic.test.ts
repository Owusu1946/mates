import assert from "node:assert/strict";
import { test } from "node:test";
import { appState, filterApps, usableApps, type AppConnection } from "./apps.logic.ts";

const app = (slug: string, change: Partial<AppConnection> = {}): AppConnection => ({ slug, name: slug[0]!.toUpperCase() + slug.slice(1), connected: false, noAuth: false, status: "INACTIVE", ...change });
const APPS = [
  app("notion"),
  app("gmail", { connected: true, status: "ACTIVE" }),
  app("weather", { noAuth: true, status: "ACTIVE" }),
  app("calendar", { status: "EXPIRED" }),
  app("slack", { status: "INITIATED" }),
];

test("each app's state, from Composio's status", () => {
  assert.deepEqual(APPS.map(appState), ["available", "connected", "ready", "reconnect", "connecting"]);
});

test("what needs you comes first, and Connected keeps it", () => {
  assert.deepEqual(filterApps(APPS, "", false).map((one) => one.slug), ["calendar", "slack", "gmail", "weather", "notion"]);
  assert.deepEqual(filterApps(APPS, "", true).map((one) => one.slug), ["calendar", "slack", "gmail", "weather"]);
  assert.deepEqual(filterApps(APPS, " GMA ", false).map((one) => one.slug), ["gmail"]);
});

test("a mate can use what's connected or needs no sign-in", () => {
  assert.deepEqual(usableApps(APPS).map((one) => one.slug), ["gmail", "weather"]);
});
