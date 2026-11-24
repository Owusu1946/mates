import type * as Electron from "electron";

/**
 * The menus, built only from Electron's standard roles so each shortcut is the one the system
 * expects (⌘ on macOS, Ctrl elsewhere) and labels follow the system's language.
 */

export function applicationMenuTemplate(platform: NodeJS.Platform, isDev: boolean, openWebsite: () => void): Electron.MenuItemConstructorOptions[] {
  return [
    // macOS apps open with the app menu (About, Hide, Quit); elsewhere File holds Quit.
    platform === "darwin" ? { role: "appMenu" } : { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        ...(isDev ? ([{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }, { type: "separator" }] as const) : []),
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    { role: "help", submenu: [{ label: "Mates website", click: openWebsite }] },
  ];
}

type TextContext = Pick<Electron.ContextMenuParams, "isEditable" | "selectionText" | "editFlags">;

/** Right-click on text gets the system's own Cut, Copy and Paste; anywhere else, nothing. */
export function textContextMenuTemplate({ isEditable, selectionText, editFlags }: TextContext): Electron.MenuItemConstructorOptions[] | null {
  if (isEditable) {
    return [
      { role: "undo", enabled: editFlags.canUndo },
      { role: "redo", enabled: editFlags.canRedo },
      { type: "separator" },
      { role: "cut", enabled: editFlags.canCut },
      { role: "copy", enabled: editFlags.canCopy },
      { role: "paste", enabled: editFlags.canPaste },
      { type: "separator" },
      { role: "selectAll", enabled: editFlags.canSelectAll },
    ];
  }
  return selectionText.trim() ? [{ role: "copy", enabled: editFlags.canCopy }] : null;
}
