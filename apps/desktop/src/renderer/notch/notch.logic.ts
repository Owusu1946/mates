/**
 * The notch's states and sizes. At rest it's the camera housing with a small ear each side (your
 * lead mate on the left, who needs you on the right). Hovering widens it to read the status.
 * Opening it (a click, or Alt+Space) grows it down into the summon bar.
 */

export type NotchMode = "rest" | "peek" | "open";
export type NotchEvent = "hoverIn" | "hoverOut" | "click" | "toggle" | "close";
export type Notch = { width: number; height: number };

/** The ears beside the camera at rest, and when you hover. */
export const REST_EAR = 34;
export const PEEK_EAR = 112;
export const OPEN_WIDTH = 600;

export function nextMode(mode: NotchMode, event: NotchEvent): NotchMode {
  if (mode === "open") return event === "toggle" || event === "close" ? "rest" : "open";
  if (event === "click" || event === "toggle") return "open";
  if (event === "hoverIn") return "peek";
  if (event === "hoverOut") return "rest";
  return mode;
}

/** The black shape's size in each state. Open, it's as tall as what's in it, below the camera. */
export function shapeSize(mode: NotchMode, notch: Notch, contentHeight: number): { width: number; height: number; radius: number } {
  if (mode === "open") return { width: OPEN_WIDTH, height: notch.height + Math.max(0, Math.ceil(contentHeight)), radius: 26 };
  if (mode === "peek") return { width: notch.width + PEEK_EAR * 2, height: notch.height + 6, radius: 16 };
  return { width: notch.width + REST_EAR * 2, height: notch.height, radius: 12 };
}

/** The notch the app measured, passed in the page's address; a sane default when it's missing. */
export function parseNotch(search: string): Notch {
  const params = new URLSearchParams(search);
  const width = Number(params.get("w"));
  const height = Number(params.get("h"));
  return {
    width: Number.isFinite(width) && width >= 120 && width <= 320 ? width : 182,
    height: Number.isFinite(height) && height >= 20 && height <= 60 ? height : 32,
  };
}
