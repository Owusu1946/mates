import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { clampSize, parseSavedSize } from "../code/panelSize.logic.ts";

type Options = {
  storageKey: string;
  /** The CSS custom property the host sizes itself from, e.g. "--panel-width". */
  property: `--${string}`;
  axis: "x" | "y";
  /** Which edge of the host the handle sits on: dragging away from the host grows it. */
  edge: "start" | "end";
  defaultSize: number;
  min: number;
  /** Read when a drag starts, so it follows the window. */
  max: () => number;
};

type Session = { start: number; from: number; host: HTMLElement; frame: number; latest: number };

function readSaved(key: string): number | null {
  try {
    return parseSavedSize(localStorage.getItem(key));
  } catch {
    return null;
  }
}

/**
 * A panel edge you can drag, as T3 Code resizes its right panel and terminal drawer
 * (hooks/useResizableWidth, useResizeDrag): every frame of the drag writes a CSS custom property
 * on the host; React state and storage change only when you let go.
 */
export function useResizable({ storageKey, property, axis, edge, defaultSize, min, max }: Options) {
  const [size, setSize] = useState(() => readSaved(storageKey) ?? defaultSize);
  const [dragging, setDragging] = useState(false);
  // The drag in progress: handlers only, never read during render.
  const drag = useRef<Session | null>(null);

  const at = (event: PointerEvent) => (axis === "x" ? event.clientX : event.clientY);
  const sizeFor = (active: Session, position: number) => {
    // A handle on the host's start edge (left, top) grows the host as it moves back.
    const delta = (position - active.start) * (edge === "start" ? -1 : 1);
    return clampSize(active.from + delta, min, max(), defaultSize);
  };

  const handleProps = {
    role: "separator" as const,
    "aria-orientation": axis === "x" ? ("vertical" as const) : ("horizontal" as const),
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const host = event.currentTarget.parentElement;
      if (event.button !== 0 || !host) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
      // Start from the size on screen, which the CSS caps may hold below the saved one.
      const shown = axis === "x" ? host.getBoundingClientRect().width : host.getBoundingClientRect().height;
      drag.current = { start: at(event), from: clampSize(shown, min, max(), defaultSize), host, frame: 0, latest: at(event) };
      setDragging(true);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const active = drag.current;
      if (!active) return;
      active.latest = at(event);
      if (active.frame) return;
      active.frame = requestAnimationFrame(() => {
        active.frame = 0;
        active.host.style.setProperty(property, `${sizeFor(active, active.latest)}px`);
      });
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const active = drag.current;
      if (!active) return;
      cancelAnimationFrame(active.frame);
      document.body.style.removeProperty("cursor");
      const next = sizeFor(active, at(event));
      drag.current = null;
      setDragging(false);
      setSize(next);
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        // Kept for this session only.
      }
    },
  };

  // The host's CSS caps the size for the current window; render only applies the minimum.
  const hostStyle = { [property]: `${Math.max(size, min)}px` } as CSSProperties;
  return { hostStyle, handleProps, dragging };
}
