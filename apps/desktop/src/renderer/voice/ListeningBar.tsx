import { useEffect, useState } from "react";
import { observeVisibleAnimation } from "../lib/visibleAnimation.ts";
import { formatClock, heardSoFar } from "./holdToTalk.logic.ts";

const BARS = 20;
/** Fast enough for words to land as they're spoken, slow enough to be cheap. */
const TICK_MS = 120;

/**
 * While you hold to talk: a level meter, how long you've held, and the words as they're heard,
 * with how to finish. Only this re-renders as it ticks. The meter's bars run on CSS and pause
 * off screen or with Reduce motion on.
 */
export function ListeningBar({ startedAt, transcript }: { startedAt: number; transcript: string }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const heard = heardSoFar(transcript, now - startedAt);

  return (
    <div role="status" aria-live="polite" className="flex min-w-0 flex-1 items-center gap-3">
      <span ref={observeVisibleAnimation} aria-hidden="true" className="flex h-6 shrink-0 items-center gap-[3px]">
        {Array.from({ length: BARS }, (_, index) => (
          <span key={index} className="voice-bar h-full w-[3px] rounded-full bg-brand" style={{ animationDelay: `${-((index * 137) % 900)}ms` }} />
        ))}
      </span>
      <span className="shrink-0 font-mono text-xs text-ink-soft tabular-nums">{formatClock(now - startedAt)}</span>
      <span className="min-w-0 flex-1 truncate text-[15px]">{heard || <span className="text-ink-soft">Listening…</span>}</span>
      <span className="shrink-0 text-2xs text-ink-soft">Release to send · Esc to cancel</span>
    </div>
  );
}
