import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { useTimelineScroll } from "./useTimelineScroll.ts";

type TimelineViewportProps = {
  scrollKey: string;
  /** Changes when something changes at the end (a new message, streaming words); not older pages loading. */
  contentKey: string;
  followLatest: boolean;
  children: ReactNode;
  composer: ReactNode;
  /** Scrolled near the top: time to load older messages. */
  onNearTop?: () => void;
};

/** Showing the jump button waits this long, so it doesn't flash while a chat opens; hiding is instant (T3 Code). */
const SHOW_JUMP_MS = 150;

export function TimelineViewport({ scrollKey, contentKey, followLatest, children, composer, onNearTop }: TimelineViewportProps) {
  const { scroller, composerDock, onScroll, follow, jumpToEnd } = useTimelineScroll(scrollKey, contentKey, followLatest, onNearTop);
  const away = follow.mode === "away";
  const [jumpShown, setJumpShown] = useState(false);

  useEffect(() => {
    if (!away) return setJumpShown(false);
    const timer = setTimeout(() => setJumpShown(true), SHOW_JUMP_MS);
    return () => clearTimeout(timer);
  }, [away]);

  return (
    <div ref={scroller} tabIndex={-1} data-focus-area="timeline" className="min-h-0 flex-1 overflow-y-auto outline-none" onScroll={onScroll}>
      <div className="flex min-h-full flex-col">
        {children}
        {/* The composer overlaps older messages and reserves its own space at the end. */}
        <div ref={composerDock} className="pointer-events-none sticky bottom-0 z-10 mt-auto shrink-0">
          {/* Above the composer without changing its height, so it never moves the chat. */}
          {jumpShown && away && (
            <div className="absolute inset-x-0 bottom-full flex justify-center pb-2">
              <Button variant="outline" size="sm" className="pointer-events-auto animate-fade rounded-full shadow-md" onClick={jumpToEnd}>
                <Icon name="chevronDown" />
                {follow.unseen ? "New messages" : "Jump to latest"}
              </Button>
            </div>
          )}
          {composer}
        </div>
      </div>
    </div>
  );
}
