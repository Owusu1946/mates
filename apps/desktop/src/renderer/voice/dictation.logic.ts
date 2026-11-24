import { heardSoFar } from "./holdToTalk.logic.ts";

/**
 * Hands-free dictation: click the mic, talk, pause if you need to, then stop. Unlike hold to talk
 * (the summon bar's Space), nothing is sent by itself: the words land in the composer to edit or
 * send. These rules keep the clock right across pauses and join the words to what you'd typed.
 */

export type DictationClock = { startedAt: number; pausedAt: number | null; pausedMs: number };

/** The last words arrive a moment after you stop, as real transcription finishes then. */
const FINISH_MS = 900;

export const startClock = (now: number): DictationClock => ({ startedAt: now, pausedAt: null, pausedMs: 0 });

export const pauseClock = (clock: DictationClock, now: number): DictationClock => (clock.pausedAt === null ? { ...clock, pausedAt: now } : clock);

export const resumeClock = (clock: DictationClock, now: number): DictationClock =>
  clock.pausedAt === null ? clock : { ...clock, pausedAt: null, pausedMs: clock.pausedMs + (now - clock.pausedAt) };

/** How long you've been talking, not counting pauses. */
export function activeMs(clock: DictationClock, now: number): number {
  const until = clock.pausedAt ?? now;
  return Math.max(0, until - clock.startedAt - clock.pausedMs);
}

/** What's been heard when you stop: everything so far, plus the words still finishing. */
export function finalWords(transcript: string, clock: DictationClock, now: number): string {
  const active = activeMs(clock, now);
  return active === 0 ? "" : heardSoFar(transcript, active + FINISH_MS);
}

/** Dictated words after what you'd typed, with one space between, or on their own. */
export function joinDictation(draft: string, words: string): string {
  if (!words) return draft;
  if (!draft.trim()) return words;
  return /\s$/.test(draft) ? `${draft}${words}` : `${draft} ${words}`;
}
