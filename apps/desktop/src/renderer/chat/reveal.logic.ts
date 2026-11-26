/**
 * Streamed words, shown smoothly. A reply arrives in snapshots a few times a second; shown as they
 * come, text lurches forward in chunks. Each frame instead shows a little more, fast enough to catch
 * up with the newest snapshot in about `CATCH_UP_MS`, and never slower than a reading pace. A gap
 * too big to animate (a reply that was already long when it opened) shows at once.
 */

/** How long showing what's arrived should take. */
export const CATCH_UP_MS = 300;
/** Characters a second, at the slowest, so the last few words of a catch-up don't trail off. */
const MIN_RATE = 400;
/** More than this behind shows at once rather than racing through it. */
export const JUMP_CHARS = 1200;

/** How many characters to show after `elapsedMs` more, from `shown` towards `total`. */
export function revealNext(shown: number, total: number, elapsedMs: number): number {
  if (shown >= total) return total;
  const behind = total - shown;
  if (behind > JUMP_CHARS) return total;
  const rate = Math.max(MIN_RATE, (behind * 1000) / CATCH_UP_MS);
  return Math.min(total, shown + Math.max(1, Math.round((rate * elapsedMs) / 1000)));
}

/**
 * Where to cut `text` at `count` characters without splitting a word mid-way or a surrogate pair:
 * back to the last space if one is near, so words appear whole.
 */
export function cutAt(text: string, count: number): string {
  if (count >= text.length) return text;
  let end = count;
  // Never between the halves of an emoji or other surrogate pair.
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  const space = text.lastIndexOf(" ", end);
  return text.slice(0, space > end - 12 && space > 0 ? space : end);
}
