// The mates' colours, exactly as the app gives them (apps/api/src/mates.ts MATE_PALETTE).
// Copied rather than imported so the site never pulls in server code. Keep the two in step.
export const MATE = {
  amber: ["#e5c59e", "#d27e41", "#9A3412"],
  teal: ["#9fd8d1", "#3a9c94", "#155e63"],
  blue: ["#b9c8f5", "#5b7be0", "#26408b"],
  green: ["#cfe3a8", "#7ea33f", "#3f5a1c"],
  purple: ["#e7c3ef", "#b061c4", "#5f2370"],
  rose: ["#f6c1c7", "#e0607a", "#8f1d3a"],
  slate: ["#d5dbe3", "#7b8794", "#323f4b"],
  sunset: ["#fde68a", "#f59e0b", "#b45309"],
} as const satisfies Record<string, readonly [string, string, string]>;

export type Gradient = [string, string, string];
export const mate = (key: keyof typeof MATE): Gradient => [...MATE[key]];
