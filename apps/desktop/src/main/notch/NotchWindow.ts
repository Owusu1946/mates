import * as Electron from "electron";
import { parseHandoff, type SummonHandoff } from "../summon/SummonWindow.logic.ts";
import { detectNotch, drifted, notchCanvasBounds, notchOptions, rememberNotch, type Area, type Notch } from "./NotchWindow.logic.ts";

export type NotchSources = { preload: string; url: string };

export type NotchControl = {
  /** Opens or closes the notch when the pointer is on the notched screen; false when there's none there. */
  toggle: () => boolean;
  /** Settings → This computer: off, the notch hides and the shortcut opens the pill instead. */
  setEnabled: (enabled: boolean) => void;
};

/** Screen changes come in bursts (lid, wake, a monitor plugged in); lay out once they settle. */
const RELAYOUT_MS = 150;
/**
 * How often to check the window is still in the notch. macOS can re-place it when you switch to a
 * full-screen app's Space without telling the app (no move event), so this is the backstop.
 */
const GUARD_MS = 1000;

/**
 * The notch window: a fixed, see-through canvas over the top of the notched screen. Only the
 * black shape inside it takes the pointer (the page says when it's over it), so the menu bar
 * either side keeps working. It shows without taking focus, takes it only while open so you can
 * type, and lays itself out again when screens change, sleep or wake. If macOS moves it (it can,
 * switching into a full-screen app's Space), it goes straight back.
 */
export function installNotch(sources: NotchSources, { openInMates }: { openInMates: (handoff: SummonHandoff) => void }): NotchControl {
  const env = { force: process.env.MATES_NOTCH === "force", width: process.env.MATES_NOTCH_WIDTH };
  let window: Electron.BrowserWindow | null = null;
  let current: { displayId: number; notch: Notch } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let enabled = true;
  /** Where the window belongs, so it can go back if macOS moves it. */
  let target: Area | null = null;
  const seen = new Map<number, { size: string; notch: Notch }>();
  const debug = process.env.MATES_NOTCH_DEBUG === "1";

  const find = () => {
    const displays = env.force ? [Electron.screen.getPrimaryDisplay()] : Electron.screen.getAllDisplays();
    for (const display of displays) {
      const notch = rememberNotch(seen, display, detectNotch(display, process.platform, env));
      if (notch) return { display, notch };
    }
    return null;
  };

  const load = (target: Electron.BrowserWindow, notch: Notch) => {
    const query = { w: String(notch.width), h: String(notch.height) };
    void target.loadURL(`${sources.url}/notch.html?${new URLSearchParams(query)}`);
  };

  const create = () => {
    const created = new Electron.BrowserWindow(notchOptions(sources.preload, process.platform));
    created.setAlwaysOnTop(true, "screen-saver");
    // A panel already joins every Space; this adds full-screen Spaces. Skipping the process-type
    // flip keeps the Dock and the main window from blinking (and windows from being re-placed).
    created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    created.setIgnoreMouseEvents(true, { forward: true });
    created.once("ready-to-show", () => created.showInactive());
    created.on("moved", () => putBack("moved"));
    created.on("show", () => putBack("shown"));
    created.on("closed", () => {
      if (window === created) window = null;
    });
    return created;
  };

  const layout = () => {
    const found = enabled ? find() : null;
    if (!found) {
      window?.hide();
      current = null;
      target = null;
      return;
    }
    const changed = !current || current.notch.width !== found.notch.width || current.notch.height !== found.notch.height;
    window ??= create();
    target = notchCanvasBounds(found.display);
    window.setBounds(target);
    if (changed) load(window, found.notch);
    else if (!window.isVisible()) window.showInactive();
    current = { displayId: found.display.id, notch: found.notch };
  };

  const putBack = (why: string) => {
    if (!window || !target || window.isDestroyed()) return;
    const actual = window.getBounds();
    if (!drifted(actual, target)) return;
    if (debug) console.log(`[notch] ${why}: at ${JSON.stringify(actual)}, back to ${JSON.stringify(target)}`);
    window.setBounds(target);
  };
  // Macs only, only while it's showing, and cheap: one bounds read a second.
  if (process.platform === "darwin" || env.force) {
    const guard = setInterval(() => window?.isVisible() && putBack("guard"), GUARD_MS);
    Electron.app.on("will-quit", () => clearInterval(guard));
  }

  const relayout = () => {
    clearTimeout(timer);
    timer = setTimeout(layout, RELAYOUT_MS);
  };

  const fromNotch = (event: Electron.IpcMainEvent) => window !== null && event.sender === window.webContents;
  Electron.ipcMain.on("mates:notch-interactive", (event, interactive: unknown) => {
    if (fromNotch(event)) window!.setIgnoreMouseEvents(interactive !== true, { forward: true });
  });
  // Open, the notch takes the keyboard so you can type; closed, it hands it straight back.
  Electron.ipcMain.on("mates:notch-focus", (event) => {
    if (fromNotch(event)) window!.focus();
  });
  Electron.ipcMain.on("mates:notch-blur", (event) => {
    if (fromNotch(event)) window!.blur();
  });
  Electron.ipcMain.on("mates:notch-open", (event, value: unknown) => {
    const handoff = fromNotch(event) ? parseHandoff(value) : null;
    if (handoff) openInMates(handoff);
  });

  layout();
  Electron.screen.on("display-added", relayout);
  Electron.screen.on("display-removed", relayout);
  Electron.screen.on("display-metrics-changed", relayout);
  Electron.powerMonitor.on("resume", relayout);

  return {
    setEnabled(next) {
      if (next === enabled) return;
      enabled = next;
      layout();
    },
    toggle() {
      if (!enabled || !window || !current || !window.isVisible()) return false;
      const pointer = Electron.screen.getDisplayNearestPoint(Electron.screen.getCursorScreenPoint());
      if (!env.force && pointer.id !== current.displayId) return false;
      window.webContents.send("mates:notch-toggle");
      return true;
    },
  };
}
