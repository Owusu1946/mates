import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BEAT_MS } from "../theme/mascotMotion.logic.ts";

/**
 * What a mascot needs to know to stay cheap: whether it's on screen (one IntersectionObserver
 * shared by every face), whether the window is visible, and whether a new state's beat is playing.
 */

const watchers = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | null = null;

function watch(element: Element, onChange: (visible: boolean) => void) {
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) watchers.get(entry.target)?.(entry.isIntersecting);
  });
  watchers.set(element, onChange);
  observer.observe(element);
  return () => {
    watchers.delete(element);
    observer?.unobserve(element);
    if (watchers.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

/** A ref for the element, and whether it's on screen. Faces start still until they're seen. */
export function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => (ref.current ? watch(ref.current, setOnScreen) : undefined), []);
  return [ref, onScreen] as const;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

/** Whether the window is showing; hidden or minimised, nothing needs to move. */
export function usePageVisible() {
  return useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "visible");
}

/** True for a beat after `key` changes (not on first render), so a new state plays, then settles. */
export function useMotionBeat(key: string) {
  const [beat, setBeat] = useState<{ key: string; playing: boolean }>({ key, playing: false });
  if (beat.key !== key) setBeat({ key, playing: true });
  useEffect(() => {
    if (!beat.playing) return;
    const timer = setTimeout(() => setBeat((current) => (current.key === beat.key ? { ...current, playing: false } : current)), BEAT_MS);
    return () => clearTimeout(timer);
  }, [beat]);
  return beat.playing;
}
