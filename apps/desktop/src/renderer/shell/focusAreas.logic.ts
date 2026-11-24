/**
 * F6 and Shift+F6 move between the window's areas, wrapping around and skipping hidden ones
 * (T3 Code: docs/user/keyboard-focus.md).
 */

/** In a run, the terminal drawer and the Diff panel join the cycle after the composer. */
export type FocusArea = "sidebar" | "timeline" | "composer" | "terminal" | "panel";
export const FOCUS_ORDER: FocusArea[] = ["sidebar", "timeline", "composer", "terminal", "panel"];

export function nextFocusArea(current: FocusArea | null, visible: FocusArea[], backwards: boolean): FocusArea | null {
  const order = FOCUS_ORDER.filter((area) => visible.includes(area));
  if (!order.length) return null;
  if (!current || !order.includes(current)) return backwards ? order.at(-1)! : order[0]!;
  const index = order.indexOf(current);
  return order[(index + (backwards ? order.length - 1 : 1)) % order.length]!;
}
