import { useSyncExternalStore } from "react";

const query = window.matchMedia("(prefers-reduced-motion: reduce)");
const subscribe = (onChange: () => void) => {
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** The system's Reduce motion setting, live. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => query.matches);
}
