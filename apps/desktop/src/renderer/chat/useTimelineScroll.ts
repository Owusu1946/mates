import { useLayoutEffect, useRef, useState, type UIEvent } from "react";
import { afterNewAtEnd, afterUserScroll, atEnd, FOLLOWING, isScrollKey, type Follow } from "./timelineFollow.logic.ts";

/** Where each timeline was left: at the end (so it reopens there), or scrolled to a place. */
const scrollMemory = new Map<string, { top: number; atEnd: boolean }>();

/** This close to the top, the page above starts loading before you reach it. */
const NEAR_TOP_PX = 400;
/** After a wheel, touch or key, scroll events this soon after are yours, not the page's. */
const GESTURE_MS = 250;
/** Frames to keep landing on the end after opening: rows near it grow as they first draw. */
const SETTLE_FRAMES = 4;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A timeline's scrolling, after T3 Code's timeline follow (rules: timelineFollow.logic.ts).
 *
 * - Opening a chat lands at its end, settling over a few frames as rows finish drawing, or back
 *   where you left it if you'd scrolled up.
 * - While following, it stays at the end through new messages, streaming words, rows growing and
 *   the window resizing. Only your own scrolling (wheel, touch, keys, dragging the scrollbar)
 *   stops it; scroll events the page makes never do.
 * - Something you just did (`forceFollow`) always shows; near the top, older messages load
 *   (`onNearTop`).
 *
 * `follow` changes only when the mode flips or something new arrives while you're away, so
 * scrolling itself never re-renders the chat.
 */
export function useTimelineScroll(key: string, content: string, forceFollow: boolean, onNearTop?: () => void) {
  const scroller = useRef<HTMLDivElement>(null);
  const composerDock = useRef<HTMLDivElement>(null);
  const followRef = useRef<Follow>(FOLLOWING);
  const [follow, setFollow] = useState<Follow>(FOLLOWING);
  const gestureUntil = useRef(0);
  const dragging = useRef(false);

  const commit = (next: Follow) => {
    if (next === followRef.current) return;
    followRef.current = next;
    setFollow(next);
  };
  const toEnd = () => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  };
  /** Lands on the end now and for a few frames after, while heights settle. */
  const settleAtEnd = () => {
    let frames = 0;
    const step = () => {
      if (followRef.current.mode !== "following") return;
      toEnd();
      if (++frames < SETTLE_FRAMES) requestAnimationFrame(step);
    };
    step();
  };

  useLayoutEffect(() => {
    const element = scroller.current!;
    const saved = scrollMemory.get(key);
    if (saved && !saved.atEnd) {
      element.scrollTop = saved.top;
      commit({ mode: "away", unseen: false });
    } else {
      commit(FOLLOWING);
      settleAtEnd();
    }
    // Only a new chat repositions; following itself is kept by the effects below.
  }, [key]);

  useLayoutEffect(() => {
    if (forceFollow) commit(FOLLOWING);
    if (followRef.current.mode === "following") settleAtEnd();
    else commit(afterNewAtEnd(followRef.current));
  }, [content, forceFollow]);

  // Content, composer and window resizes keep the end in view while following.
  useLayoutEffect(() => {
    const element = scroller.current!;
    const inner = element.firstElementChild;
    const dock = composerDock.current;
    if (!inner || !dock) return;
    const observer = new ResizeObserver(() => {
      element.style.setProperty("--composer-viewport-height", `${element.clientHeight}px`);
      // Leave room for the sticky composer when a message control scrolls into view.
      element.style.scrollPaddingBottom = `${dock.offsetHeight}px`;
      if (followRef.current.mode === "following") element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    observer.observe(inner);
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  // Your gestures, so a scroll can be told apart from one the page made.
  useLayoutEffect(() => {
    const element = scroller.current!;
    const gesture = () => {
      gestureUntil.current = performance.now() + GESTURE_MS;
    };
    const key = (event: KeyboardEvent) => isScrollKey(event.key) && gesture();
    // Pressing on the scroller itself, not a message in it, is the scrollbar.
    const press = (event: PointerEvent) => {
      if (event.target === element) dragging.current = true;
    };
    const release = () => {
      dragging.current = false;
    };
    element.addEventListener("wheel", gesture, { passive: true });
    element.addEventListener("touchmove", gesture, { passive: true });
    element.addEventListener("keydown", key);
    element.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    return () => {
      element.removeEventListener("wheel", gesture);
      element.removeEventListener("touchmove", gesture);
      element.removeEventListener("keydown", key);
      element.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
    };
  }, []);

  const onScroll = (event: UIEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const end = atEnd(element.scrollHeight, element.scrollTop, element.clientHeight);
    scrollMemory.set(key, { top: element.scrollTop, atEnd: end });
    if (dragging.current || performance.now() < gestureUntil.current) commit(afterUserScroll(followRef.current, end));
    // Near the top: older messages load above, and the browser keeps your place as they arrive.
    if (element.scrollTop < NEAR_TOP_PX) onNearTop?.();
  };

  /** Jump to latest: follow again, gliding to the end (instantly with reduced motion). */
  const jumpToEnd = () => {
    const element = scroller.current;
    if (!element) return;
    commit(FOLLOWING);
    if (reducedMotion()) return settleAtEnd();
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    // Heights can change on the way down; land on the real end once the glide is done.
    setTimeout(() => followRef.current.mode === "following" && settleAtEnd(), 450);
  };

  return { scroller, composerDock, onScroll, follow, jumpToEnd };
}
