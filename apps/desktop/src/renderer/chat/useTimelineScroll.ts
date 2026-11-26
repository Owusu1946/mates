import { useLayoutEffect, useRef, type UIEvent } from "react";

/** Where each timeline was scrolled to, so coming back to it lands in the same place. */
const scrollMemory = new Map<string, number>();
/** Within this of the end counts as "at the bottom", so new content keeps it in view (T3 Code's follow mode). */
const FOLLOW_SLACK_PX = 48;

/** This close to the top, the page above starts loading before you reach it. */
const NEAR_TOP_PX = 400;

const nearBottom = (element: HTMLElement) => element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_SLACK_PX;

/**
 * A timeline's scrolling: back where you left `key`, or at the newest content the first time;
 * keeps up with new content (`content` changes) while you're at the bottom; and always shows
 * something you just did (`forceFollow`); and asks for older messages near the top (`onNearTop`).
 */
export function useTimelineScroll(key: string, content: string, forceFollow: boolean, onNearTop?: () => void) {
  const scroller = useRef<HTMLDivElement>(null);
  const composerDock = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  useLayoutEffect(() => {
    const element = scroller.current!;
    const saved = scrollMemory.get(key);
    element.scrollTop = saved ?? element.scrollHeight;
    following.current = saved === undefined || nearBottom(element);
  }, [key]);

  useLayoutEffect(() => {
    const element = scroller.current!;
    if (following.current || forceFollow) {
      element.scrollTop = element.scrollHeight;
      following.current = true;
    }
  }, [content, forceFollow]);

  // Content, composer and window resizes should keep the latest message in view while following.
  useLayoutEffect(() => {
    const element = scroller.current!;
    const content = element.firstElementChild;
    const dock = composerDock.current;
    if (!content || !dock) return;
    const observer = new ResizeObserver(() => {
      element.style.setProperty("--composer-viewport-height", `${element.clientHeight}px`);
      // Leave room for the sticky composer when a message control scrolls into view.
      element.style.scrollPaddingBottom = `${dock.offsetHeight}px`;
      if (following.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    observer.observe(content);
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  const onScroll = (event: UIEvent<HTMLElement>) => {
    scrollMemory.set(key, event.currentTarget.scrollTop);
    following.current = nearBottom(event.currentTarget);
    // Near the top: older messages load above, and the browser keeps your place as they arrive.
    if (event.currentTarget.scrollTop < NEAR_TOP_PX) onNearTop?.();
  };

  return { scroller, composerDock, onScroll };
}
