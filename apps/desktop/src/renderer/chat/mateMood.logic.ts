import type { MateStatus } from "../data/sampleCrew.ts";
import type { Reply } from "./chatFlow.logic.ts";

/**
 * What a mate's face shows in the moment, over its usual status: it listens while you type to it,
 * thinks while it works out an answer, works while the reply streams in, and is happy for a beat
 * once it's done.
 */

/** How long after your last keystroke the mate stops listening. */
export const TYPING_SETTLE_MS = 1600;

export function moodOf(mateId: string, { replies, typingTo, happy }: { replies: Record<string, Reply>; typingTo: string | null; happy: ReadonlySet<string> }): MateStatus | null {
  const reply = Object.values(replies).find((candidate) => candidate.mateId === mateId);
  if (reply) return reply.phase === "thinking" ? "thinking" : "working";
  if (typingTo === mateId) return "listening";
  if (happy.has(mateId)) return "happy";
  return null;
}

/** Mates whose reply just finished: they were replying before and aren't now. */
export function finishedReplying(before: Record<string, Reply>, after: Record<string, Reply>): string[] {
  const still = new Set(Object.values(after).map((reply) => reply.mateId));
  return Object.values(before).filter((reply) => !still.has(reply.mateId)).map((reply) => reply.mateId);
}
