import { useLayoutEffect, useRef, type UIEvent } from "react";

/** Where each timeline was scrolled to, so coming back to it lands in the same place. */
const scrollMemory = new Map<string, number>();
/** Within this of the end counts as "at the bottom", so new content keeps it in view (T3 Code's follow mode). */
const FOLLOW_SLACK_PX = 48;

const nearBottom = (element: HTMLElement) => element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_SLACK_PX;

/**
 * A timeline's scrolling: back where you left `key`, or at the newest content the first time;
 * keeps up with new content (`content` changes) while you're at the bottom; and always shows
 * something you just did (`forceFollow`).
 */
export function useTimelineScroll(key: string, content: string, forceFollow: boolean) {
  const scroller = useRef<HTMLDivElement>(null);
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

  // Content that grows in place, like a thought streaming in, keeps the bottom in view too.
  useLayoutEffect(() => {
    const element = scroller.current!;
    const content = element.firstElementChild;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (following.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const onScroll = (event: UIEvent<HTMLElement>) => {
    scrollMemory.set(key, event.currentTarget.scrollTop);
    following.current = nearBottom(event.currentTarget);
  };

  return { scroller, onScroll };
}
