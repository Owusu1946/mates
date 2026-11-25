import type * as Electron from "electron";

/**
 * Mates in the MacBook notch: the summon bar lives in the camera housing on Macs that have one,
 * and grows down out of it (docs/desktop/desktop-app.md, "Summon bar"). These rules decide where
 * the notch is and where the window goes; NotchWindow.ts does the opening. Macs without a notch,
 * external screens, Windows and Linux keep the centred summon pill.
 *
 * Electron can't ask macOS for the notch's exact size (NSScreen.auxiliaryTopLeftArea), so this
 * reads the signs it can see: the built-in screen, with the taller menu bar notched Macs have
 * (about 37pt against 24pt). Like Dynamac Island, the width is a fixed, tuned value rather than a
 * measurement; MATES_NOTCH_WIDTH overrides it while tuning on real hardware.
 */

export type Area = { x: number; y: number; width: number; height: number };
export type DisplayLike = { internal?: boolean; bounds: Area; workArea: Area };
export type Notch = { width: number; height: number };

/** The camera housing on 14" and 16" MacBook Pros and the 13"/15" Airs, in points. */
export const DEFAULT_NOTCH_WIDTH = 182;
/** Menu bars at least this tall only come with a notch. */
const NOTCHED_MENU_BAR = 30;

/** The window is this big and never resizes; only the black shape inside it moves. */
export const NOTCH_CANVAS = { width: 720, height: 560 } as const;

/** The notch on this display, or null when it has none. `force` previews it anywhere, for development. */
export function detectNotch(display: DisplayLike, platform: string, env: { force?: boolean; width?: string } = {}): Notch | null {
  const menuBar = display.workArea.y - display.bounds.y;
  const width = Number(env.width);
  const notchWidth = Number.isFinite(width) && width >= 120 && width <= 320 ? Math.round(width) : DEFAULT_NOTCH_WIDTH;
  if (env.force) return { width: notchWidth, height: menuBar >= 20 ? menuBar : 32 };
  if (platform !== "darwin" || !display.internal || menuBar < NOTCHED_MENU_BAR) return null;
  return { width: notchWidth, height: menuBar };
}

/**
 * The notch on this display, remembering what was seen before. A full-screen app hides the menu
 * bar, so its height stops giving the notch away, but the camera housing is still there: once a
 * built-in screen has shown its notch, it keeps it until its size changes (a new resolution).
 */
export function rememberNotch(seen: Map<number, { size: string; notch: Notch }>, display: DisplayLike & { id: number }, detected: Notch | null): Notch | null {
  const size = `${display.bounds.width}x${display.bounds.height}`;
  if (detected) {
    seen.set(display.id, { size, notch: detected });
    return detected;
  }
  const known = seen.get(display.id);
  return known && known.size === size ? known.notch : null;
}

/** Whether the window has drifted from where it belongs, as macOS does on a Space change. */
export const drifted = (actual: Area, target: Area) => actual.x !== target.x || actual.y !== target.y || actual.width !== target.width || actual.height !== target.height;

/** The canvas, centred on the notch, flush with the top of the screen (over the menu bar). */
export function notchCanvasBounds(display: DisplayLike): Area {
  const width = Math.min(NOTCH_CANVAS.width, display.bounds.width);
  return { x: Math.round(display.bounds.x + (display.bounds.width - width) / 2), y: display.bounds.y, width, height: NOTCH_CANVAS.height };
}

export function notchOptions(preload: string, platform: string): Electron.BrowserWindowConstructorOptions {
  return {
    ...NOTCH_CANVAS,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    // A non-activating panel on a Mac, so the notch never pulls focus from the app you're in.
    ...(platform === "darwin" ? { type: "panel" as const } : {}),
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    enableLargerThanScreen: true,
    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false },
  };
}
