import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationPresentation } from "./notification-presentation.ts";

test("hides a short chat reply while the app is open", () => {
  assert.deepEqual(notificationPresentation({ quietInForeground: true }, "active"), {
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  });
});

test("shows that reply once the app is not open", () => {
  for (const appState of ["background", "inactive", "unknown"]) {
    const presentation = notificationPresentation({ quietInForeground: true }, appState);
    assert.equal(presentation.shouldShowBanner, true);
    assert.equal(presentation.shouldPlaySound, true);
  }
});

test("shows long work, scheduled work, and other pushes while the app is open", () => {
  for (const data of [undefined, null, {}, { quietInForeground: false }, { codeRunId: "1" }]) {
    const presentation = notificationPresentation(data, "active");
    assert.equal(presentation.shouldShowBanner, true);
    assert.equal(presentation.shouldPlaySound, true);
  }
});
