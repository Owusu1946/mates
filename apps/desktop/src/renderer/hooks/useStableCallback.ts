import { useInsertionEffect, useRef, useState } from "react";

/**
 * A function whose identity never changes but always calls the latest `fn` (T3 Code's
 * hooks/useStableCallback). For handlers that leave a long-lived component: props, effects.
 * Call only from handlers and effects; render sees the previous commit's fn.
 */
export function useStableCallback<Args extends ReadonlyArray<unknown>, Result>(fn: (...args: Args) => Result): (...args: Args) => Result {
  const latest = useRef(fn);
  // Insertion effects run before every layout effect, so a child's layout effect already calls this render's fn.
  useInsertionEffect(() => {
    latest.current = fn;
  });
  const [stable] = useState(() => (...args: Args) => latest.current(...args));
  return stable;
}
