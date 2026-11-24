import * as Electron from "electron";

/**
 * One running copy, and each system's own habits for windows: macOS keeps the app in the Dock
 * with no windows and reopens one on click; Windows and Linux quit when the last window closes.
 * `onReady` runs once Electron is ready and before the first window, so guards and menus cover it.
 */
export function startLifecycle({ onReady, openWindow }: { onReady: () => void; openWindow: () => Electron.BrowserWindow }) {
  if (!Electron.app.requestSingleInstanceLock()) {
    // Another copy runs; it brings its window forward (second-instance below).
    Electron.app.quit();
    return;
  }

  let mainWindow: Electron.BrowserWindow | null = null;
  const open = () => {
    const window = openWindow();
    window.on("closed", () => {
      if (mainWindow === window) mainWindow = null;
    });
    mainWindow = window;
  };

  // A second launch brings the running window forward instead of opening another app.
  Electron.app.on("second-instance", () => {
    if (!mainWindow) return open();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  Electron.app.on("activate", () => {
    if (Electron.BrowserWindow.getAllWindows().length === 0) open();
  });
  Electron.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") Electron.app.quit();
  });

  void Electron.app.whenReady().then(() => {
    onReady();
    open();
  });
}
