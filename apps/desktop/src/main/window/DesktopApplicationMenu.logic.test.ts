import assert from "node:assert/strict";
import { test } from "node:test";
import { applicationMenuTemplate, textContextMenuTemplate } from "./DesktopApplicationMenu.logic.ts";

const noop = () => {};
const roles = (items: { role?: string }[]) => items.map((item) => item.role);
const flags = { canUndo: true, canRedo: false, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true, canEditRichly: false };

test("macOS starts with the app menu, other systems with File", () => {
  assert.equal(applicationMenuTemplate("darwin", false, noop)[0]?.role, "appMenu");
  assert.equal(applicationMenuTemplate("win32", false, noop)[0]?.role, "fileMenu");
  assert.equal(applicationMenuTemplate("linux", false, noop)[0]?.role, "fileMenu");
});

test("developer tools are only in development builds", () => {
  const view = (isDev: boolean) => applicationMenuTemplate("win32", isDev, noop).find((item) => item.label === "View")?.submenu as { role?: string }[];
  assert.ok(roles(view(true)).includes("toggleDevTools"));
  assert.ok(!roles(view(false)).includes("toggleDevTools"));
  assert.ok(!roles(view(false)).includes("reload"));
});

test("editable text gets the full edit menu, selected text gets Copy, elsewhere nothing", () => {
  const editable = textContextMenuTemplate({ isEditable: true, selectionText: "", editFlags: flags });
  assert.deepEqual(roles(editable ?? []).filter(Boolean), ["undo", "redo", "cut", "copy", "paste", "selectAll"]);
  assert.equal(editable?.find((item) => item.role === "redo")?.enabled, false);
  assert.deepEqual(roles(textContextMenuTemplate({ isEditable: false, selectionText: "Hello", editFlags: flags }) ?? []), ["copy"]);
  assert.equal(textContextMenuTemplate({ isEditable: false, selectionText: "  ", editFlags: flags }), null);
});
