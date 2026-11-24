import type * as Electron from "electron";

/**
 * The summon bar's window: a pill that floats over whatever app you're in, opened from anywhere
 * with a shortcut (desktop-app.md, "Mates anywhere on your computer"). These rules decide its
 * size, where it opens and which shortcut it gets; SummonWindow.ts does the opening.
 */

export const SUMMON_WIDTH = 680;
/** The page pads the pill so its shadow isn't clipped; the window includes that padding. */
export const SUMMON_MIN_HEIGHT = 96;
export const SUMMON_MAX_HEIGHT = 520;
/** It opens a little above the middle of the screen, as Spotlight and Raycast do. */
const FROM_TOP = 0.22;

export type Area = { x: number; y: number; width: number; height: number };

/** The page's measured height, kept within the window's limits. */
export function summonHeight(measured: unknown): number {
  const value = typeof measured === "number" && Number.isFinite(measured) ? Math.ceil(measured) : SUMMON_MIN_HEIGHT;
  return Math.min(Math.max(value, SUMMON_MIN_HEIGHT), SUMMON_MAX_HEIGHT);
}

/** Centred across the screen the pointer is on, a fifth of the way down; never wider than the screen. */
export function summonBounds(workArea: Area, height: number): Area {
  const width = Math.min(SUMMON_WIDTH, workArea.width - 32);
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + workArea.height * FROM_TOP),
    width,
    height: Math.min(height, workArea.height),
  };
}

/**
 * Shortcuts to try, in order. Alt+Space (Option+Space on a Mac) first, as the plan says; if
 * another app holds it, Ctrl/⌘+Shift+Space.
 */
export function summonShortcuts(platform: NodeJS.Platform | string): string[] {
  return platform === "darwin" ? ["Alt+Space", "Command+Shift+Space"] : ["Alt+Space", "Control+Shift+Space"];
}

/** How a shortcut reads in a menu: "Alt+Space", or "⌥Space" on a Mac. */
export function shortcutLabel(accelerator: string, platform: NodeJS.Platform | string): string {
  if (platform !== "darwin") return accelerator.replace("Control", "Ctrl");
  return accelerator.replace("Command+", "⌘").replace("Shift+", "⇧").replace("Alt+", "⌥");
}

export function summonOptions(preload: string): Electron.BrowserWindowConstructorOptions {
  return {
    width: SUMMON_WIDTH,
    height: SUMMON_MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  };
}

/** A conversation from the bar carried into the full app: which mate, what you asked, what it said. */
export type SummonHandoff = { mateId: string; question: string; answer: string };

/** A hand-off from the page, or null when it isn't one; the page is never trusted. */
export function parseHandoff(value: unknown): SummonHandoff | null {
  if (typeof value !== "object" || value === null) return null;
  const { mateId, question, answer } = value as Record<string, unknown>;
  if (typeof mateId !== "string" || typeof question !== "string" || typeof answer !== "string") return null;
  if (!/^[\w-]{1,64}$/.test(mateId) || !question.trim()) return null;
  return { mateId, question: question.slice(0, 4000), answer: answer.slice(0, 8000) };
}
