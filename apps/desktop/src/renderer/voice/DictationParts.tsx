import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { cn } from "../lib/utils.ts";
import { observeVisibleAnimation } from "../lib/visibleAnimation.ts";
import { tickTextContent } from "../lib/tickTextContent.ts";
import { activeMs, type DictationClock } from "./dictation.logic.ts";
import { formatClock, heardSoFar } from "./holdToTalk.logic.ts";
import type { Dictation } from "./useDictation.ts";

/** Fast enough for words to land as they're spoken, slow enough to be cheap. */
const TICK_MS = 120;
const BARS = 14;

/**
 * The words as they're heard, after anything you'd already typed. Only this re-renders as it
 * ticks, and it stops ticking while paused.
 */
export function DictationText({ clock, transcript, before, className }: { clock: DictationClock; transcript: string; before?: string; className?: string }) {
  const paused = clock.pausedAt !== null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [paused]);
  const heard = heardSoFar(transcript, activeMs(clock, paused ? clock.pausedAt! : now));
  return (
    <p aria-live="polite" className={cn("wrap-anywhere whitespace-pre-wrap", className)}>
      {before && <span>{before.trimEnd()} </span>}
      {heard ? <span className="text-ink">{heard}</span> : <span className="text-ink-soft">{paused ? "Paused" : "Listening…"}</span>}
      {!paused && <span aria-hidden="true" className="ml-0.5 inline-block h-[1.1em] w-0.5 translate-y-[0.2em] animate-pulse rounded-full bg-brand" />}
    </p>
  );
}

/** The level meter and the clock. Bars run on CSS and freeze while paused, off screen or with Reduce motion. */
export function DictationMeter({ clock }: { clock: DictationClock }) {
  const paused = clock.pausedAt !== null;
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <span ref={observeVisibleAnimation} aria-hidden="true" className="flex h-5 items-center gap-[3px]">
        {Array.from({ length: BARS }, (_, index) => (
          <span
            key={index}
            className={cn("voice-bar h-full w-[3px] rounded-full", paused ? "bg-ink-soft/50 [animation-play-state:paused]!" : "bg-brand")}
            style={{ animationDelay: `${-((index * 137) % 900)}ms` }}
          />
        ))}
      </span>
      <span ref={tickTextContent((now) => formatClock(activeMs(clock, now)), !paused)} className="font-mono text-xs text-ink-soft tabular-nums" />
    </span>
  );
}

/** Cancel, the meter, and pause or resume: the left of a dictating bar. Done or Send goes on the right. */
export function DictationControls({ dictation, onCancel }: { dictation: Dictation; onCancel: () => void }) {
  if (!dictation.clock) return null;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Button size="icon-sm" variant="ghost-muted" aria-label="Cancel dictation" title="Cancel (Esc)" onClick={onCancel}>
        <Icon name="x" />
      </Button>
      <DictationMeter clock={dictation.clock} />
      <span className="flex-1" />
      <Button size="sm" variant="ghost" aria-label={dictation.paused ? "Resume" : "Pause"} onClick={dictation.togglePause}>
        <Icon name={dictation.paused ? "mic" : "pause"} />
        {dictation.paused ? "Resume" : "Pause"}
      </Button>
    </div>
  );
}
