import * as Electron from "electron";

export type AppControls = {
  /** Brings the main window forward, opening it again if it was closed. */
  showMain: () => Electron.BrowserWindow;
};

/**
 * One running copy, and each system's own habits for windows. With the tray and the hidden
 * summon bar, closing the main window leaves Mates running, so the bar still opens from any app;
 * Quit in the tray or the app menu ends it. `onReady` runs once Electron is ready and before the
 * first window, so guards, menus and the tray cover it. Returns whether this is the copy that keeps
 * running, so the caller can set up what has to exist before Electron is ready.
 */
export function startLifecycle({
  onReady,
  openWindow,
  quitOnClose = () => false,
}: {
  onReady: (controls: AppControls) => void;
  openWindow: () => Electron.BrowserWindow;
  /** Settings → This computer: closing the window quits, instead of leaving Mates in the tray. */
  quitOnClose?: () => boolean;
}): boolean {
  if (!Electron.app.requestSingleInstanceLock()) {
    // Another copy runs; it brings its window forward (second-instance below).
    Electron.app.quit();
    return false;
  }

  let mainWindow: Electron.BrowserWindow | null = null;
  const open = () => {
    const window = openWindow();
    window.on("closed", () => {
      if (mainWindow === window) mainWindow = null;
      // A Mac keeps apps open without windows, as people expect there.
      if (quitOnClose() && process.platform !== "darwin") Electron.app.quit();
    });
    mainWindow = window;
    return window;
  };
  const showMain = () => {
    if (!mainWindow) return open();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  };

  // A second launch brings the running window forward instead of opening another app.
  Electron.app.on("second-instance", showMain);
  // The Dock icon on a Mac reopens the window; the hidden summon bar doesn't count as one.
  Electron.app.on("activate", () => {
    if (!mainWindow) open();
  });
  Electron.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") Electron.app.quit();
  });

  void Electron.app.whenReady().then(() => {
    onReady({ showMain });
    open();
  });
  return true;
}
