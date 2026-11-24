/**
 * The settings that change how the app itself behaves, set from Settings and applied in the main
 * process: opening at login, what closing the window does, the summon bar's shortcut, and the
 * notch on a Mac. Anything the page sends is checked here first; the page is never trusted.
 */

export type DesktopPrefs = {
  openAtLogin: boolean;
  /** Closing the window leaves Mates in the tray, so the summon bar still works. Off, it quits. */
  keepRunning: boolean;
  summonShortcut: string;
  notch: boolean;
};

/** Shortcuts the summon bar may use: ones that don't fight with common apps. */
export const SUMMON_SHORTCUT_CHOICES = ["Alt+Space", "Control+Shift+Space", "Control+Alt+M", "Command+Shift+Space"] as const;

export const DEFAULT_DESKTOP_PREFS: DesktopPrefs = { openAtLogin: false, keepRunning: true, summonShortcut: "Alt+Space", notch: true };

/** Preferences from the page, or null when they aren't any. Unknown shortcuts fall back to the default. */
export function parseDesktopPrefs(value: unknown): DesktopPrefs | null {
  if (typeof value !== "object" || value === null) return null;
  const { openAtLogin, keepRunning, summonShortcut, notch } = value as Record<string, unknown>;
  if (typeof openAtLogin !== "boolean" || typeof keepRunning !== "boolean" || typeof notch !== "boolean") return null;
  const shortcut = SUMMON_SHORTCUT_CHOICES.includes(summonShortcut as (typeof SUMMON_SHORTCUT_CHOICES)[number]) ? (summonShortcut as string) : DEFAULT_DESKTOP_PREFS.summonShortcut;
  return { openAtLogin, keepRunning, summonShortcut: shortcut, notch };
}

/** The choices that make sense on this system: ⌘ ones on a Mac, Ctrl ones elsewhere. */
export function shortcutChoices(platform: string): string[] {
  return SUMMON_SHORTCUT_CHOICES.filter((choice) => (platform === "darwin" ? !choice.startsWith("Control") : !choice.startsWith("Command")));
}
