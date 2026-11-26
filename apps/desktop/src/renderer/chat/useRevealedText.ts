import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion.ts";
import { cutAt, revealNext } from "./reveal.logic.ts";

/**
 * A streaming reply's text as it should show this frame (rules: reveal.logic.ts). Only the row
 * using it re-renders each frame, and only while it's catching up. Text already there when the
 * row first shows (opening a chat mid-reply) shows at once; with reduced motion, everything does.
 */
export function useRevealedText(text: string): string {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(text.length);
  const shownRef = useRef(shown);

  useEffect(() => {
    if (reduced) {
      shownRef.current = text.length;
      setShown(text.length);
      return;
    }
    if (shownRef.current >= text.length) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = revealNext(shownRef.current, text.length, now - last);
      last = now;
      shownRef.current = next;
      setShown(next);
      if (next < text.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, reduced]);

  return cutAt(text, Math.min(shown, text.length));
}
