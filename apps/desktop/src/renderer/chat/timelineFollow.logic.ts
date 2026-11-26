/**
 * Whether the timeline follows the newest message, after T3 Code's timeline follow
 * (apps/web/src/components/chat/useTimelineFollow.ts):
 *
 * - Only you scrolling (wheel, touch, keys, dragging the scrollbar) can stop following. Scrolls
 *   the page makes itself, like rows growing as they first draw or a reply streaming in, never
 *   do, so the chat always ends at the end while you're there.
 * - Scrolling back to the end, or Jump to latest, follows again.
 * - While you're away from the end, anything new at the end is noted, for the jump button.
 */

export type Follow = { mode: "following" } | { mode: "away"; unseen: boolean };

export const FOLLOWING: Follow = { mode: "following" };

/** You scrolled: following again at the end, otherwise away (keeping whether something new came). */
export function afterUserScroll(follow: Follow, atEnd: boolean): Follow {
  if (atEnd) return FOLLOWING;
  return follow.mode === "away" ? follow : { mode: "away", unseen: false };
}

/** Something changed at the end of the chat: noted only while you're away. */
export function afterNewAtEnd(follow: Follow): Follow {
  return follow.mode === "away" && !follow.unseen ? { mode: "away", unseen: true } : follow;
}

/** Keys that scroll the timeline when it has focus. */
const SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "]);
export const isScrollKey = (key: string) => SCROLL_KEYS.has(key);

/** How close to the end still counts as at it (T3 Code's follow slack). */
export const AT_END_PX = 48;
export const atEnd = (scrollHeight: number, scrollTop: number, clientHeight: number) => scrollHeight - scrollTop - clientHeight < AT_END_PX;
