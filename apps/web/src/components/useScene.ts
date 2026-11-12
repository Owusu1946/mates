import { useEffect, useRef, useState } from "react";

/**
 * Plays a demo forward one step at a time while it is on screen. `wait(step)` says how long to
 * hold a step before the next (undefined = hold until the visitor acts). Reduced motion jumps
 * straight to the finished last step.
 */
export function useScene<S extends string>(steps: readonly S[], wait: (step: S) => number | undefined) {
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<S>(steps[0]!);
  const [visible, setVisible] = useState(false);
  const holdFor = useRef(wait);
  holdFor.current = wait;

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setStep(steps.at(-1)!);
      return;
    }
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [steps]);

  useEffect(() => {
    if (!visible) return;
    const ms = holdFor.current(step);
    const next = steps[steps.indexOf(step) + 1];
    if (ms === undefined || !next) return;
    const id = setTimeout(() => setStep(next), ms);
    return () => clearTimeout(id);
  }, [visible, step, steps]);

  const at = (s: S) => steps.indexOf(step) >= steps.indexOf(s);
  return { root, step, setStep, at };
}
