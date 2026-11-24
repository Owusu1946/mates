import { useSyncExternalStore } from "react";
import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from "./preferences.logic.ts";

/**
 * Preferences, saved on this device. The ones about the app itself (open at login, closing, the
 * summon shortcut, the notch) go to the main process at start and on every change.
 */

const KEY = "mates.preferences";
const listeners = new Set<() => void>();

function read() {
  try {
    return parsePreferences(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

let current = read();
window.mates.setDesktopPrefs(current.desktop);

/** Changes one section, e.g. setPreference("notifications", { sound: true }). */
export function setPreference<K extends keyof Preferences>(section: K, change: Partial<Preferences[K]>) {
  current = { ...current, [section]: { ...current[section], ...change } };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Not saved, but it still applies for this session.
  }
  if (section === "desktop") window.mates.setDesktopPrefs(current.desktop);
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function usePreferences() {
  return useSyncExternalStore(subscribe, () => current);
}
