import * as Electron from "electron";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { installTextContextMenu } from "./DesktopApplicationMenu.ts";
import { WINDOW_COLOURS, parseColorScheme, titleBarOverlay, visibleBounds, windowOptions, type Appearance } from "./DesktopWindow.logic.ts";

/** Where the window was and whether it was maximised, so it reopens the way it was left. */
type SavedWindowState = { bounds: Electron.Rectangle; maximized: boolean };

export type WindowSources = {
  preload: string;
  /** The dev server in development, else the bundled index.html. */
  url: string | null;
  file: string;
  /** Linux needs the icon on the window while running unpackaged. */
  icon?: string;
};

/** The app's main windows: the ones with our title bar. The see-through summon bar isn't one. */
const mainWindows = new Set<Electron.BrowserWindow>();

const stateFile = () => NodePath.join(Electron.app.getPath("userData"), "window-state.json");
const appearance = (): Appearance => (Electron.nativeTheme.shouldUseDarkColors ? "dark" : "light");

function readSavedState(): { bounds: Electron.Rectangle | null; maximized: boolean } {
  try {
    const saved = JSON.parse(NodeFS.readFileSync(stateFile(), "utf8")) as SavedWindowState;
    const bounds = visibleBounds(saved.bounds, Electron.screen.getAllDisplays().map((display) => display.workArea));
    return { bounds, maximized: bounds !== null && saved.maximized === true };
  } catch {
    // First launch, or an unreadable file: open centred at the default size.
    return { bounds: null, maximized: false };
  }
}

function saveStateOnClose(window: Electron.BrowserWindow) {
  window.on("close", () => {
    // The normal bounds, so a maximised window restores to its last real size.
    const state: SavedWindowState = { bounds: window.getNormalBounds(), maximized: window.isMaximized() };
    try {
      NodeFS.writeFileSync(stateFile(), JSON.stringify(state));
    } catch {
      // Losing the position isn't worth a crash on quit.
    }
  });
}

export function createMainWindow(sources: WindowSources): Electron.BrowserWindow {
  const saved = readSavedState();
  const window = new Electron.BrowserWindow(
    windowOptions({ platform: process.platform, appearance: appearance(), preload: sources.preload, bounds: saved.bounds ?? undefined, icon: sources.icon }),
  );
  window.once("ready-to-show", () => {
    if (saved.maximized) window.maximize();
    window.show();
    window.webContents.setBackgroundThrottling(true);
  });
  saveStateOnClose(window);
  mainWindows.add(window);
  window.on("closed", () => mainWindows.delete(window));
  installTextContextMenu(window.webContents);
  // Full screen hides the traffic lights, so the title bar can stop leaving room for them.
  const sendFullScreen = () => window.webContents.send("mates:full-screen", window.isFullScreen());
  window.on("enter-full-screen", sendFullScreen);
  window.on("leave-full-screen", sendFullScreen);
  window.webContents.on("did-finish-load", sendFullScreen);
  if (sources.url) void window.loadURL(sources.url);
  else void window.loadFile(sources.file);
  return window;
}

/**
 * The page's colour scheme (System, Light, Dark) drives Electron's, and every change repaints
 * what the system draws on the main windows: Windows' caption buttons and the window colour
 * behind the page. Other windows, like the see-through summon bar, have neither.
 */
export function followAppearance() {
  Electron.ipcMain.on("mates:color-scheme", (_event, value: unknown) => {
    const scheme = parseColorScheme(value);
    if (scheme && Electron.nativeTheme.themeSource !== scheme) Electron.nativeTheme.themeSource = scheme;
  });
  Electron.nativeTheme.on("updated", () => {
    const now = appearance();
    for (const window of mainWindows) {
      if (window.isDestroyed()) continue;
      if (process.platform === "win32") window.setTitleBarOverlay(titleBarOverlay(now));
      window.setBackgroundColor(WINDOW_COLOURS[now].background);
    }
  });
}
