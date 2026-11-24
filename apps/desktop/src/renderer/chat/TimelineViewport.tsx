import type { ReactNode } from "react";
import { useTimelineScroll } from "./useTimelineScroll.ts";

type TimelineViewportProps = {
  scrollKey: string;
  contentKey: string;
  followLatest: boolean;
  children: ReactNode;
  composer: ReactNode;
};

export function TimelineViewport({ scrollKey, contentKey, followLatest, children, composer }: TimelineViewportProps) {
  const { scroller, composerDock, onScroll } = useTimelineScroll(scrollKey, contentKey, followLatest);

  return (
    <div ref={scroller} tabIndex={-1} data-focus-area="timeline" className="min-h-0 flex-1 overflow-y-auto outline-none" onScroll={onScroll}>
      <div className="flex min-h-full flex-col">
        {children}
        {/* The composer overlaps older messages and reserves its own space at the end. */}
        <div ref={composerDock} className="pointer-events-none sticky bottom-0 z-10 mt-auto shrink-0">
          {composer}
        </div>
      </div>
    </div>
  );
}
