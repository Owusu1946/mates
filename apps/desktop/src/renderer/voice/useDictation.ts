import { useState } from "react";
import { finalWords, pauseClock, resumeClock, startClock, type DictationClock } from "./dictation.logic.ts";

/**
 * One hands-free dictation: click to start, pause and resume, stop to get the words, cancel to
 * drop them. Until /v1/transcribe is wired up, what you "say" is `transcript`, heard at speaking pace.
 */
export function useDictation(transcript: string) {
  const [clock, setClock] = useState<DictationClock | null>(null);
  return {
    clock,
    active: clock !== null,
    paused: clock?.pausedAt != null,
    start() {
      if (!clock) setClock(startClock(Date.now()));
    },
    togglePause() {
      if (clock) setClock(clock.pausedAt === null ? pauseClock(clock, Date.now()) : resumeClock(clock, Date.now()));
    },
    /** Ends it and returns what was heard. */
    stop(): string {
      if (!clock) return "";
      setClock(null);
      return finalWords(transcript, clock, Date.now());
    },
    cancel() {
      setClock(null);
    },
  };
}

export type Dictation = ReturnType<typeof useDictation>;
