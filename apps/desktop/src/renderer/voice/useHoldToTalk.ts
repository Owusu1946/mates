import { useEffect, useState } from "react";
import { releaseOutcome } from "./holdToTalk.logic.ts";

/** How long the "hold, don't tap" hint stays after a tap. */
const HINT_MS = 2500;

/**
 * One hold-to-talk gesture: start when the key or button goes down, release to send what was
 * said, cancel to drop it. A tap shorter than a hold sends nothing and shows a hint instead.
 */
export function useHoldToTalk({ transcript, onSend }: { transcript: string; onSend: (text: string) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint]);

  return {
    listening: startedAt !== null,
    startedAt,
    hint,
    start() {
      if (startedAt !== null) return;
      setHint(false);
      setStartedAt(Date.now());
    },
    release() {
      if (startedAt === null) return;
      const held = Date.now() - startedAt;
      setStartedAt(null);
      if (releaseOutcome(held) === "send") onSend(transcript);
      else setHint(true);
    },
    cancel() {
      setStartedAt(null);
    },
  };
}
