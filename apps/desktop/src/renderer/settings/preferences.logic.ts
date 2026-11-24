/**
 * Settings that aren't appearance, usage or coding: how the app behaves on this computer, what
 * your mates remember and notice, the morning brief, notifications, voice, privacy and updates.
 * Saved on this device; anything unreadable falls back to its default, field by field.
 */

export type Preferences = {
  desktop: { openAtLogin: boolean; keepRunning: boolean; summonShortcut: string; notch: boolean };
  memory: { saveAutomatically: boolean; referenceChats: boolean };
  noticed: { habits: boolean; apps: boolean; meetingPrep: boolean };
  brief: { on: boolean; time: string; weekends: boolean };
  notifications: { done: boolean; needsYou: boolean; friends: boolean; sound: boolean; quietHours: boolean };
  voice: { captions: boolean; holdSpace: boolean };
  privacy: { snapshot: boolean };
  updates: { automatic: boolean; beta: boolean };
};

export const DEFAULT_PREFERENCES: Preferences = {
  desktop: { openAtLogin: false, keepRunning: true, summonShortcut: "Alt+Space", notch: true },
  memory: { saveAutomatically: true, referenceChats: true },
  noticed: { habits: true, apps: false, meetingPrep: true },
  brief: { on: true, time: "7:00", weekends: false },
  notifications: { done: true, needsYou: true, friends: true, sound: false, quietHours: true },
  voice: { captions: true, holdSpace: true },
  // SnapShot is off until you turn it on, as the plan says.
  privacy: { snapshot: false },
  updates: { automatic: true, beta: false },
};

/** Each saved value of the right type replaces its default; everything else keeps the default. */
function merge<T extends Record<string, unknown>>(defaults: T, saved: unknown): T {
  if (typeof saved !== "object" || saved === null) return defaults;
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = (saved as Record<string, unknown>)[key as string];
    if (typeof value === typeof defaults[key]) out[key] = value as T[keyof T];
  }
  return out;
}

export function parsePreferences(saved: string | null): Preferences {
  if (!saved) return DEFAULT_PREFERENCES;
  try {
    const value = JSON.parse(saved) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(DEFAULT_PREFERENCES).map(([section, defaults]) => [section, merge(defaults, value[section])])) as Preferences;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** How a shortcut reads: "Alt+Space", or "⌥Space" on a Mac. */
export function shortcutLabel(accelerator: string, platform: string): string {
  if (platform !== "darwin") return accelerator.replace("Control", "Ctrl");
  return accelerator.replace("Command+", "⌘").replace("Shift+", "⇧").replace("Alt+", "⌥");
}
