import { useSyncExternalStore } from "react";
import { DEFAULT_APPEARANCE, isDark, parseAppearance, type Appearance } from "./appearance.logic.ts";

/**
 * The appearance store. Saved on this device only (T3 Code: appearance is per device), applied to
 * <html> before React renders so the first frame is right, and passed to the main process so the
 * parts the system draws (Windows' caption buttons, the window colour) match.
 */

const KEY = "mates.appearance";
const system = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function read(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

let current = read();

function apply() {
  const root = document.documentElement;
  root.dataset.theme = current.theme;
  root.classList.toggle("dark", isDark(current.scheme, system.matches));
  window.mates.setColorScheme(current.scheme);
}

export function setAppearance(next: Partial<Appearance>) {
  current = { ...current, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Not saved, but it still applies for this session.
  }
  apply();
  for (const listener of listeners) listener();
}

/** Applies the saved appearance and keeps System in step with the computer. Call once, before render. */
export function startAppearance() {
  apply();
  system.addEventListener("change", () => {
    apply();
    for (const listener of listeners) listener();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useAppearance(): Appearance & { dark: boolean } {
  const appearance = useSyncExternalStore(subscribe, () => current);
  const dark = useSyncExternalStore(subscribe, () => isDark(current.scheme, system.matches));
  return { ...appearance, dark };
}
