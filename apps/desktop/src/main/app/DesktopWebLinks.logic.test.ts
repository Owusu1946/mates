import assert from "node:assert/strict";
import { test } from "node:test";
import { externalUrl, isAllowedPermission, isAppUrl } from "./DesktopWebLinks.logic.ts";

test("the app's own pages may write to the clipboard, and nothing else", () => {
  const entry = "http://localhost:5173";
  assert.equal(isAllowedPermission("clipboard-sanitized-write", "http://localhost:5173/", entry), true);
  assert.equal(isAllowedPermission("clipboard-sanitized-write", "https://example.com", entry), false);
  assert.equal(isAllowedPermission("media", "http://localhost:5173/", entry), false);
  assert.equal(isAllowedPermission("notifications", "http://localhost:5173/", entry), false);
});

test("in development only the dev server's pages are the app", () => {
  const entry = "http://localhost:5173";
  assert.equal(isAppUrl("http://localhost:5173", entry), true);
  assert.equal(isAppUrl("http://localhost:5173/settings", entry), true);
  assert.equal(isAppUrl("http://localhost:51730/", entry), false);
  assert.equal(isAppUrl("https://example.com", entry), false);
});

test("installed, only the bundled index.html is the app, with any query or hash", () => {
  const entry = "file:///C:/Program%20Files/Mates/resources/app.asar/dist/renderer/index.html";
  assert.equal(isAppUrl(entry, entry), true);
  assert.equal(isAppUrl(`${entry}#/chat`, entry), true);
  assert.equal(isAppUrl("file:///C:/Windows/System32/drivers/etc/hosts", entry), false);
});

test("only https links open in the system browser", () => {
  assert.equal(externalUrl("https://agents.askorin.app"), "https://agents.askorin.app");
  assert.equal(externalUrl("http://example.com"), null);
  assert.equal(externalUrl("file:///etc/passwd"), null);
  assert.equal(externalUrl("javascript:alert(1)"), null);
  assert.equal(externalUrl("not a url"), null);
});
