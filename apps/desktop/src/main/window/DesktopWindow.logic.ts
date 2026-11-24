import type * as Electron from "electron";

/**
 * How the window looks and behaves on each system, kept free of Electron at runtime so it can be
 * tested on any machine. Windows draws its caption buttons over our title bar, macOS insets the
 * traffic lights, and Linux keeps the desktop's own frame so GNOME and KDE themes apply. The
 * canvas is painted solid, as in T3 Code, so Nightly's true black stays black.
 */

export type Appearance = "light" | "dark";

/** Nightly's canvas and text (src/renderer/styles.css), for what paints before the page does. */
export const WINDOW_COLOURS = {
  light: { background: "#fcfcfc", text: "#18181b" },
  dark: { background: "#000000", text: "#f5f5f5" },
} as const;

/** Height of our title bar; Windows' caption buttons are drawn to match it. */
export const TITLE_BAR_HEIGHT = 40;
export const DEFAULT_SIZE = { width: 1180, height: 760 };
export const MIN_SIZE = { width: 760, height: 520 };

export type WindowInput = {
  platform: NodeJS.Platform;
  appearance: Appearance;
  preload: string;
  bounds?: Partial<Electron.Rectangle>;
  /** Linux shows this in the window and taskbar while running unpackaged. */
  icon?: string;
};

export function windowOptions({ platform, appearance, preload, bounds, icon }: WindowInput): Electron.BrowserWindowConstructorOptions {
  const base: Electron.BrowserWindowConstructorOptions = {
    title: "Mates",
    width: bounds?.width ?? DEFAULT_SIZE.width,
    height: bounds?.height ?? DEFAULT_SIZE.height,
    ...(bounds?.x !== undefined && bounds?.y !== undefined ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    // Shown on ready-to-show, painted in the canvas colour until then: no white flash.
    show: false,
    backgroundColor: WINDOW_COLOURS[appearance].background,
    webPreferences: {
      preload,
      // A hidden renderer is throttled, which stalls its first paint; turned back on once shown.
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: true,
    },
  };

  if (platform === "darwin") return { ...base, titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 13 } };
  if (platform === "win32") return { ...base, titleBarStyle: "hidden", titleBarOverlay: titleBarOverlay(appearance) };
  // Linux: the desktop's own frame and title bar; the menu bar appears on Alt.
  return { ...base, autoHideMenuBar: true, ...(icon ? { icon } : {}) };
}

/** Windows' caption buttons, on a transparent strip, with symbols in the text colour. */
export function titleBarOverlay(appearance: Appearance) {
  return { color: "#00000000", symbolColor: WINDOW_COLOURS[appearance].text, height: TITLE_BAR_HEIGHT };
}

/** The colour scheme the page asked for, or null if it's not one we know. */
export function parseColorScheme(value: unknown): "system" | "light" | "dark" | null {
  return value === "system" || value === "light" || value === "dark" ? value : null;
}

/**
 * Saved bounds only if enough of the window would land on a screen that's connected now
 * (a laptop undocked from its monitor), else null so the window opens centred.
 */
export function visibleBounds(saved: Electron.Rectangle | null, workAreas: Electron.Rectangle[], minVisible = 120): Electron.Rectangle | null {
  if (!saved) return null;
  const width = Math.max(saved.width, MIN_SIZE.width);
  const height = Math.max(saved.height, MIN_SIZE.height);
  const onScreen = workAreas.some((area) => {
    const overlapX = Math.min(saved.x + width, area.x + area.width) - Math.max(saved.x, area.x);
    const overlapY = Math.min(saved.y + height, area.y + area.height) - Math.max(saved.y, area.y);
    return overlapX >= minVisible && overlapY >= Math.min(minVisible, TITLE_BAR_HEIGHT * 2);
  });
  return onScreen ? { x: saved.x, y: saved.y, width, height } : null;
}
