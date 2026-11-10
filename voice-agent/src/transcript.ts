import type { TranscriptLine } from './api.ts';

/** Lines the API accepts in one report; a long call keeps its most recent part. */
export const MAX_LINES = 400;
const MAX_CHARS = 1_500;

/** The call as it happened, with who said each line: "You" for the user, a mate's name otherwise. */
export class Transcript {
  readonly startedAt = Date.now();
  #lines: TranscriptLine[] = [];

  add(speaker: string, text: string, at = new Date()) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    this.#lines.push({ speaker: speaker.slice(0, 80), text: clean.slice(0, MAX_CHARS), at: at.toISOString() });
    if (this.#lines.length > MAX_LINES) this.#lines.splice(0, this.#lines.length - MAX_LINES);
  }

  get lines(): readonly TranscriptLine[] {
    return this.#lines;
  }

  report(now = Date.now()) {
    return { durationSec: Math.max(0, Math.round((now - this.startedAt) / 1000)), transcript: [...this.#lines] };
  }
}
