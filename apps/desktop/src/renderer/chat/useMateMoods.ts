import { useEffect, useRef, useState } from "react";
import { BEAT_MS } from "../theme/mascotMotion.logic.ts";
import type { Reply } from "./chatFlow.logic.ts";
import { finishedReplying, moodOf, TYPING_SETTLE_MS } from "./mateMood.logic.ts";

/**
 * Mates' moods in the moment (rules: mateMood.logic): `noteTyping` when you type to a mate makes it
 * listen until you pause, and a finished reply makes it happy for a beat.
 */
export function useMateMoods(replies: Record<string, Reply>) {
  const [typingTo, setTypingTo] = useState<string | null>(null);
  const [happy, setHappy] = useState<ReadonlySet<string>>(new Set());
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const happyTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const previous = useRef(replies);

  useEffect(() => {
    const done = finishedReplying(previous.current, replies);
    previous.current = replies;
    if (!done.length) return;
    setHappy((current) => new Set([...current, ...done]));
    // Each beat ends on its own: a later reply mustn't cancel an earlier mate's beat.
    const timer = setTimeout(() => {
      happyTimers.current.delete(timer);
      setHappy((current) => new Set([...current].filter((id) => !done.includes(id))));
    }, BEAT_MS);
    happyTimers.current.add(timer);
  }, [replies]);

  useEffect(() => {
    const timers = happyTimers.current;
    return () => {
      clearTimeout(typingTimer.current);
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return {
    moodOf: (mateId: string) => moodOf(mateId, { replies, typingTo, happy }),
    noteTyping(mateId: string | null) {
      clearTimeout(typingTimer.current);
      setTypingTo(mateId);
      if (mateId) typingTimer.current = setTimeout(() => setTypingTo(null), TYPING_SETTLE_MS);
    },
  };
}
