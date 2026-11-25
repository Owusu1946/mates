import { useSyncExternalStore } from "react";
import { parsePins, reorderPins, togglePin, type PinPlace } from "./pins.logic.ts";

/** Pinned chats, saved on this device. `hopped` is the one just pinned, so only it plays its hop. */

const KEY = "mates.pins";
const listeners = new Set<() => void>();

function read() {
  try {
    return parsePins(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

let state = { pins: read(), hopped: null as string | null };

function commit(pins: string[], hopped: string | null) {
  state = { pins, hopped };
  try {
    localStorage.setItem(KEY, JSON.stringify(pins));
  } catch {
    // Not saved, but it still holds for this session.
  }
  for (const listener of listeners) listener();
}

export function togglePinned(id: string) {
  const pins = togglePin(state.pins, id);
  commit(pins, pins.length > state.pins.length ? id : null);
}

export const movePin = (moved: string, target: string, place: PinPlace) => commit(reorderPins(state.pins, moved, target, place), null);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function usePins() {
  return useSyncExternalStore(subscribe, () => state);
}
