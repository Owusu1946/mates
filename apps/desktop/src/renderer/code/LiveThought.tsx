import { useEffect, useState } from "react";
import { Icon } from "../components/ui/Icon.tsx";
import { observeVisibleAnimation } from "../lib/visibleAnimation.ts";
import { revealWords, splitThought, wordCount } from "./thought.logic.ts";
import { ThoughtText } from "./ThoughtText.tsx";
import { WorkLogDetails } from "./WorkLog.tsx";

/** Time kept back at the end, so the whole thought sits on screen a beat before the next step. */
const SETTLE_MS = 300;

/**
 * The mate thinking out loud (T3 Code's live reasoning row): "Thinking" with a light passing
 * over it until the thought's heading arrives, then the heading, and the reasoning streaming in
 * underneath, following the newest line. Only this row re-renders as the words arrive.
 */
export function LiveThought({ thought, ms }: { thought: string; ms: number }) {
  const total = wordCount(thought);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const every = Math.max(12, (ms - SETTLE_MS) / Math.max(1, total));
    const timer = setInterval(() => setShown((count) => Math.min(total, count + 1)), every);
    return () => clearInterval(timer);
  }, [ms, total]);

  const { heading, body } = splitThought(revealWords(thought, shown));
  // A heading still arriving ("**Underst") isn't shown as text.
  const visibleBody = heading === null && body.startsWith("**") ? "" : body;
  const streaming = shown < total;

  return (
    <div role="status" aria-live="polite" className="flex animate-fade flex-col">
      <div className="flex min-h-6 min-w-0 items-center gap-1.5 px-0.5 text-sm leading-relaxed">
        <span className="flex size-6 shrink-0 items-center justify-center">
          <Icon name="brain" size={16} className="text-ink" />
        </span>
        <span ref={observeVisibleAnimation} className="min-w-0 truncate">
          <span className={streaming ? "live-shine" : "text-ink-soft"}>{heading ?? "Thinking"}</span>
        </span>
      </div>
      {visibleBody && (
        <WorkLogDetails followLive>
          <ThoughtText body={visibleBody} />
        </WorkLogDetails>
      )}
    </div>
  );
}
