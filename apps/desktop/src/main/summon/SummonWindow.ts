import * as Electron from "electron";
import { parseHandoff, summonBounds, summonHeight, summonOptions, summonShortcuts, type SummonHandoff } from "./SummonWindow.logic.ts";

export type SummonSources = { preload: string; url: string | null; file: string };

export type Summon = {
  toggle: () => void;
  /** The shortcut it got, or null when every choice was taken by another app. */
  shortcut: string | null;
};

/**
 * The summon bar: a floating pill, made once and kept hidden, so the shortcut opens it at once
 * from any app, even with the main window closed. It hides when you click away or press Escape,
 * and "Open in Mates" carries the conversation into the full app.
 */
export function installSummon(
  sources: SummonSources,
  { openInMates, intercept }: { openInMates: (handoff: SummonHandoff) => void; /** Takes the shortcut first, like the notch on its screen. */ intercept?: () => boolean },
): Summon {
  const window = new Electron.BrowserWindow(summonOptions(sources.preload));
  if (process.platform === "darwin") {
    // Over full-screen apps and on every Space, like Spotlight.
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setAlwaysOnTop(true, "pop-up-menu");
  }
  if (sources.url) void window.loadURL(`${sources.url}/summon.html`);
  else void window.loadFile(sources.file);

  let height = summonHeight(undefined);
  const fromBar = (event: Electron.IpcMainEvent) => event.sender === window.webContents;

  const hide = () => {
    if (!window.isVisible()) return;
    window.hide();
    // On a Mac, focus goes back to the app you were in only if Mates steps aside too.
    if (process.platform === "darwin" && !Electron.BrowserWindow.getAllWindows().some((other) => other !== window && other.isVisible())) Electron.app.hide();
  };

  const show = () => {
    const display = Electron.screen.getDisplayNearestPoint(Electron.screen.getCursorScreenPoint());
    window.setBounds(summonBounds(display.workArea, height));
    window.show();
    window.focus();
    window.webContents.send("mates:summon-shown");
  };

  window.on("blur", () => {
    if (!window.webContents.isDevToolsOpened()) hide();
  });

  Electron.ipcMain.on("mates:summon-resize", (event, measured: unknown) => {
    if (!fromBar(event)) return;
    height = summonHeight(measured);
    const bounds = window.getBounds();
    if (bounds.height !== height) window.setBounds({ ...bounds, height });
  });
  Electron.ipcMain.on("mates:summon-hide", (event) => {
    if (fromBar(event)) hide();
  });
  Electron.ipcMain.on("mates:summon-open", (event, value: unknown) => {
    const handoff = fromBar(event) ? parseHandoff(value) : null;
    if (!handoff) return;
    window.hide();
    openInMates(handoff);
  });

  const toggle = () => {
    if (!window.isVisible() && intercept?.()) return;
    if (window.isVisible()) hide();
    else show();
  };
  const shortcut = summonShortcuts(process.platform).find((accelerator) => Electron.globalShortcut.register(accelerator, toggle)) ?? null;
  Electron.app.on("will-quit", () => Electron.globalShortcut.unregisterAll());

  return { toggle, shortcut };
}

/**
 * Hand-offs wait here until the main window's page takes them: it may still be loading, or
 * opening for the first time. The page is told one is ready and asks for it.
 */
export function installHandoffs(): { deliver: (window: Electron.BrowserWindow, handoff: SummonHandoff) => void } {
  let pending: SummonHandoff | null = null;
  Electron.ipcMain.handle("mates:take-handoff", () => {
    const handoff = pending;
    pending = null;
    return handoff;
  });
  return {
    deliver(window, handoff) {
      pending = handoff;
      if (!window.webContents.isLoading()) window.webContents.send("mates:handoff-ready");
    },
  };
}
