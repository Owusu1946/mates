import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_SIZE, TITLE_BAR_HEIGHT, WINDOW_COLOURS, parseColorScheme, visibleBounds, windowOptions } from "./DesktopWindow.logic.ts";

const preload = "/app/dist/preload/index.cjs";

test("Windows draws its caption buttons over our title bar, in the text colour", () => {
  const options = windowOptions({ platform: "win32", appearance: "dark", preload });
  assert.equal(options.titleBarStyle, "hidden");
  assert.deepEqual(options.titleBarOverlay, { color: "#00000000", symbolColor: WINDOW_COLOURS.dark.text, height: TITLE_BAR_HEIGHT });
});

test("the window is painted in Nightly's canvas until the page loads", () => {
  assert.equal(windowOptions({ platform: "win32", appearance: "dark", preload }).backgroundColor, "#000000");
  assert.equal(windowOptions({ platform: "darwin", appearance: "light", preload }).backgroundColor, WINDOW_COLOURS.light.background);
});

test("macOS insets the traffic lights", () => {
  const options = windowOptions({ platform: "darwin", appearance: "light", preload });
  assert.equal(options.titleBarStyle, "hiddenInset");
  assert.equal(options.titleBarOverlay, undefined);
});

test("Linux keeps the desktop's own frame", () => {
  const options = windowOptions({ platform: "linux", appearance: "dark", preload, icon: "/app/icon.png" });
  assert.equal(options.titleBarStyle, undefined);
  assert.equal(options.frame, undefined);
  assert.equal(options.autoHideMenuBar, true);
  assert.equal(options.icon, "/app/icon.png");
});

test("every platform opens hidden, sandboxed and isolated", () => {
  for (const platform of ["win32", "darwin", "linux"] as const) {
    const options = windowOptions({ platform, appearance: "dark", preload });
    assert.equal(options.show, false);
    assert.equal(options.webPreferences?.sandbox, true);
    assert.equal(options.webPreferences?.contextIsolation, true);
    assert.equal(options.webPreferences?.nodeIntegration, false);
    assert.equal(options.webPreferences?.preload, preload);
  }
});

test("only known colour schemes are accepted from the page", () => {
  assert.equal(parseColorScheme("dark"), "dark");
  assert.equal(parseColorScheme("system"), "system");
  assert.equal(parseColorScheme("sepia"), null);
  assert.equal(parseColorScheme({ scheme: "dark" }), null);
});

test("saved bounds are used only while they land on a connected screen", () => {
  const screen = { x: 0, y: 0, width: 1920, height: 1040 };
  const saved = { x: 200, y: 100, width: 1200, height: 800 };
  assert.deepEqual(visibleBounds(saved, [screen]), saved);
  assert.equal(visibleBounds({ ...saved, x: 2400 }, [screen]), null);
  assert.equal(visibleBounds(null, [screen]), null);
  assert.deepEqual(visibleBounds({ x: 10, y: 10, width: 100, height: 100 }, [screen]), { x: 10, y: 10, ...MIN_SIZE });
});
