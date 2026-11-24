import * as Electron from "electron";
import type { NotchControl } from "../notch/NotchWindow.ts";
import type { Summon } from "../summon/SummonWindow.ts";
import { DEFAULT_DESKTOP_PREFS, parseDesktopPrefs, shortcutChoices, type DesktopPrefs } from "./DesktopPrefs.logic.ts";

/**
 * Applies Settings' choices about the app itself: opening at login, what
 * closing the window does, the summon shortcut and the notch. The page sends them on start and on
 * every change; it can ask for the version and the shortcuts it may offer.
 */
export function installDesktopPrefs({ summon, notch }: { summon: Summon; notch: NotchControl }) {
  let prefs: DesktopPrefs = DEFAULT_DESKTOP_PREFS;

  Electron.ipcMain.on("mates:desktop-prefs", (_event, value: unknown) => {
    const next = parseDesktopPrefs(value);
    if (!next) return;
    if (Electron.app.isPackaged && next.openAtLogin !== prefs.openAtLogin) Electron.app.setLoginItemSettings({ openAtLogin: next.openAtLogin });
    summon.setShortcut(next.summonShortcut);
    notch.setEnabled(next.notch);
    prefs = next;
  });

  Electron.ipcMain.handle("mates:app-info", () => ({
    version: Electron.app.getVersion(),
    shortcut: summon.shortcut,
    shortcutChoices: shortcutChoices(process.platform),
  }));

  return { quitOnClose: () => !prefs.keepRunning };
}
