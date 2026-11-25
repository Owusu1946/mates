/**
 * Pinned chats: the mates (and groups) you keep at hand stand together on a shelf at the top of
 * the sidebar, in the order you put them. Saved on this device.
 */

/** Two rows of four on the shelf; past that it's a list again. */
export const MAX_PINS = 8;

export type PinPlace = "before" | "after";

/** Pins, or unpins, a chat. A new pin joins the end; a full shelf takes no more. */
export function togglePin(pins: string[], id: string): string[] {
  if (pins.includes(id)) return pins.filter((pinned) => pinned !== id);
  return pins.length >= MAX_PINS ? pins : [...pins, id];
}

export const isShelfFull = (pins: string[]) => pins.length >= MAX_PINS;

/** Moves a pin next to another one, as a drag on the shelf drops it. */
export function reorderPins(pins: string[], moved: string, target: string, place: PinPlace): string[] {
  if (moved === target || !pins.includes(moved) || !pins.includes(target)) return pins;
  const rest = pins.filter((pinned) => pinned !== moved);
  const at = rest.indexOf(target) + (place === "after" ? 1 : 0);
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** Which side of a tile the pointer is on, so the drop lands before or after it. */
export const dropPlace = (pointerX: number, left: number, width: number): PinPlace => (pointerX < left + width / 2 ? "before" : "after");

/** The pins that still name a chat, in shelf order; a chat that's gone quietly drops off. */
export function pinnedChats<T extends { id: string }>(chats: T[], pins: string[]): T[] {
  return pins.flatMap((id) => chats.filter((chat) => chat.id === id));
}

/** What's saved, or nothing if it can't be read. */
export function parsePins(saved: string | null): string[] {
  try {
    const value: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))].slice(0, MAX_PINS) : [];
  } catch {
    return [];
  }
}
