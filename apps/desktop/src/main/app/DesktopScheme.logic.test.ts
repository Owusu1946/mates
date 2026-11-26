import assert from "node:assert/strict";
import * as NodePath from "node:path";
import { test } from "node:test";
import { APP_ORIGIN, rendererFile } from "./DesktopScheme.logic.ts";
import { isAppUrl } from "./DesktopWebLinks.logic.ts";

const root = NodePath.resolve("/opt/Mates/resources/app.asar/dist/renderer");

test("the app's root and its pages are files in the renderer folder", () => {
  assert.equal(rendererFile("mates://app/", root), NodePath.join(root, "index.html"));
  assert.equal(rendererFile("mates://app/summon.html", root), NodePath.join(root, "summon.html"));
  assert.equal(rendererFile("mates://app/notch.html?w=200&h=32", root), NodePath.join(root, "notch.html"));
  assert.equal(rendererFile("mates://app/assets/index-abc.js", root), NodePath.join(root, "assets", "index-abc.js"));
  assert.equal(rendererFile("mates://app/assets/my%20font.woff2", root), NodePath.join(root, "assets", "my font.woff2"));
});

test("nothing outside the renderer folder, and no other host or scheme", () => {
  // The URL parser folds plain and encoded dot segments away, so these stay in the folder.
  assert.equal(rendererFile("mates://app/../main/index.js", root), NodePath.join(root, "main", "index.js"));
  assert.equal(rendererFile("mates://app/%2e%2e/main/index.js", root), NodePath.join(root, "main", "index.js"));
  // An encoded slash survives the parser, so decoding it would climb out.
  assert.equal(rendererFile("mates://app/..%2f..%2fpackage.json", root), null);
  assert.equal(rendererFile("mates://app/assets/..%5c..%5cpackage.json", root), null);
  assert.equal(rendererFile("mates://app/%E0%A4%A", root), null);
  assert.equal(rendererFile("mates://other/index.html", root), null);
  assert.equal(rendererFile("file:///etc/passwd", root), null);
  assert.equal(rendererFile("not a url", root), null);
});

test("installed, every page on mates://app is the app's, and nothing else is", () => {
  assert.equal(isAppUrl("mates://app/", APP_ORIGIN), true);
  assert.equal(isAppUrl("mates://app/summon.html", APP_ORIGIN), true);
  assert.equal(isAppUrl("mates://app.evil.com/", APP_ORIGIN), false);
  assert.equal(isAppUrl("https://accounts.google.com/", APP_ORIGIN), false);
});
