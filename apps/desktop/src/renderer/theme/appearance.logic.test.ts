import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { DEFAULT_APPEARANCE, isDark, parseAppearance, THEMES } from "./appearance.logic.ts";

test("Nightly, following the system, is the default", () => {
  assert.deepEqual(DEFAULT_APPEARANCE, { scheme: "system", theme: "nightly" });
  assert.deepEqual(parseAppearance(null), DEFAULT_APPEARANCE);
});

test("System follows the computer; Light and Dark don't", () => {
  assert.equal(isDark("system", true), true);
  assert.equal(isDark("system", false), false);
  assert.equal(isDark("dark", false), true);
  assert.equal(isDark("light", true), false);
});

test("a saved appearance is read back, and anything odd falls back", () => {
  assert.deepEqual(parseAppearance('{"scheme":"dark","theme":"harmattan"}'), { scheme: "dark", theme: "harmattan" });
  assert.deepEqual(parseAppearance('{"scheme":"sepia","theme":"neon"}'), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance("not json"), DEFAULT_APPEARANCE);
});

test("every theme has its own light and dark colours in styles.css", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.equal(new Set(THEMES.map((theme) => theme.name)).size, THEMES.length);
  for (const { name } of THEMES.filter((theme) => theme.name !== "nightly")) {
    assert.ok(css.includes(`:root[data-theme="${name}"] {`), `${name} light`);
    assert.ok(css.includes(`:root[data-theme="${name}"].dark {`), `${name} dark`);
  }
  assert.deepEqual(parseAppearance('{"scheme":"light","theme":"kente"}'), { scheme: "light", theme: "kente" });
});
