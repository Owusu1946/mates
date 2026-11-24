import { useSyncExternalStore } from "react";
import { DEFAULT_CODING, parseCoding, type CodingPreference } from "./coding.logic.ts";

/**
 * The coding preference, saved on this device like the appearance. `engaged` remembers that you've
 * started coding (a mate coded for you, or you connected a project), so Automatic stays on.
 */

const KEY = "mates.coding";
const listeners = new Set<() => void>();

function read() {
  try {
    return parseCoding(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_CODING;
  }
}

let current = read();

function save(next: typeof DEFAULT_CODING) {
  if (next.preference === current.preference && next.engaged === current.engaged) return;
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Not saved, but it still applies for this session.
  }
  for (const listener of listeners) listener();
}

export const setCodingPreference = (preference: CodingPreference) => save({ ...current, preference });

/** A new member's answer from onboarding: their preference, and nobody has started coding yet. */
export const startCoding = (preference: CodingPreference) => save({ preference, engaged: false });

/** You've started coding: in Automatic, the coding tools appear and stay. */
export const markCodingEngaged = () => save({ ...current, engaged: true });

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useCoding() {
  return useSyncExternalStore(subscribe, () => current);
}
