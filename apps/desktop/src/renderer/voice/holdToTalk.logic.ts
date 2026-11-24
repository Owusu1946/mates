/**
 * Hold to talk (desktop-app.md, "Mates anywhere on your computer"): hold, speak, let go. These
 * rules decide what a hold means and how the words appear while you speak. Until /v1/transcribe
 * is wired up, what you "said" is a sample line, revealed at speaking pace.
 */

/** Shorter than this is a tap, not a hold: nothing is sent, and the bar says how it works. */
export const MIN_HOLD_MS = 350;
/** About how fast people speak, so the words keep up with the hold. */
const WORDS_PER_SECOND = 2.6;
/** The words start a beat after you do, as real transcription does. */
const FIRST_WORD_MS = 450;

export type HoldOutcome = "send" | "tooShort";

export function releaseOutcome(heldMs: number): HoldOutcome {
  return heldMs >= MIN_HOLD_MS ? "send" : "tooShort";
}

/**
 * What's shown after `heldMs` of holding: whole words, at speaking pace. The final words arrive
 * after you let go, as real transcription finishes then, so a send carries the whole line.
 */
export function heardSoFar(transcript: string, heldMs: number): string {
  const words = transcript.split(/\s+/).filter(Boolean);
  const count = Math.max(0, Math.floor(((heldMs - FIRST_WORD_MS) / 1000) * WORDS_PER_SECOND) + 1);
  return words.slice(0, Math.min(words.length, heldMs < FIRST_WORD_MS ? 0 : count)).join(" ");
}

/** 0:04 · 1:12 */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
