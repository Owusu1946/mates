/**
 * When a mascot moves, and how smoothly, so a sidebar full of faces stays cheap on the lowest-end
 * PCs (after OpenMausBot's mascot clock). A face moves only while it's on screen and the window is
 * visible; small faces in lists move at 30 frames a second and big ones at 60, less on weak
 * machines; and a face that isn't doing anything holds still, after a short beat when its state
 * changes, instead of breathing forever.
 */

/** A beat: how long a face shows a new state before it settles. */
export const BEAT_MS = 1400;
/** Faces this big and up (onboarding, the summon bar) keep breathing while idle. */
export const LARGE_MASCOT_PX = 56;
/** Faces this small and down are list faces: fewer frames, and no idle breathing. */
const LIST_MASCOT_PX = 48;

/** States where the mate is actually doing something, so its face keeps moving. */
const ACTIVE_STATES = new Set(["listening", "thinking", "searching", "working", "excited", "happy"]);

export type Machine = { cores?: number; memoryGb?: number };

/** Four cores or fewer, or 4 GB of memory or less: draw fewer frames everywhere. */
export function isLowEnd({ cores, memoryGb }: Machine): boolean {
  return (cores !== undefined && cores <= 4) || (memoryGb !== undefined && memoryGb <= 4);
}

/** Milliseconds between drawn frames for a face this size. */
export function frameIntervalFor(size: number, lowEnd: boolean): number {
  const fps = size <= LIST_MASCOT_PX ? (lowEnd ? 24 : 30) : lowEnd ? 30 : 60;
  return Math.round(1000 / fps);
}

type MotionInput = { state: string; size: number; onScreen: boolean; pageVisible: boolean; reducedMotion: boolean; beat: boolean; still?: boolean };

/** Whether the face moves right now. */
export function shouldAnimate({ state, size, onScreen, pageVisible, reducedMotion, beat, still = false }: MotionInput): boolean {
  if (still || reducedMotion || !onScreen || !pageVisible) return false;
  return ACTIVE_STATES.has(state) || beat || size >= LARGE_MASCOT_PX;
}
