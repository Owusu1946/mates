import { CIRCLE, HEXAGON, TRIANGLE } from "@muse-clone/mascot/outlines";
import { useId, type CSSProperties } from "react";
import { MATE_PALETTE } from "../theme/matePalette.ts";

/**
 * The Mates mark: three mates gathered, a hexagon, a circle and a triangle, the same cells as the
 * website's logo (apps/web/src/components/Logo.astro) in the app's amber, blue and green. On first
 * paint they step out from the middle, once, as the website's does.
 */

const path = (points: readonly number[]) => points.reduce((d, value, index) => d + (index % 2 ? ` ${value}` : `${index ? "L" : "M"}${value}`), "") + "Z";

const CELLS = [
  { x: 100, y: 68.45, shape: HEXAGON, scale: 0.405, colors: MATE_PALETTE.amber },
  { x: 63.57, y: 131.55, shape: CIRCLE, scale: 0.405, colors: MATE_PALETTE.blue },
  { x: 135.43, y: 126.55, shape: TRIANGLE, scale: 0.445, colors: MATE_PALETTE.green },
].map((cell) => ({ ...cell, d: path(cell.shape) }));

export function MatesLogo({ size = 20 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="-8 -8 216 216" aria-hidden="true" className="shrink-0 overflow-visible">
      <defs>
        {CELLS.map((cell, index) => (
          <linearGradient key={index} id={`${id}-${index}`} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={cell.colors[0]} />
            <stop offset=".55" stopColor={cell.colors[1]} />
            <stop offset="1" stopColor={cell.colors[2]} />
          </linearGradient>
        ))}
      </defs>
      {CELLS.map((cell, index) => (
        <g key={index} transform={`translate(${cell.x} ${cell.y})`}>
          <g className="logo-cell" style={{ "--from-x": `${(100 - cell.x) * 0.6}px`, "--from-y": `${(100 - cell.y) * 0.6}px` } as CSSProperties}>
            <path d={cell.d} fill={`url(#${id}-${index})`} transform={`scale(${cell.scale}) translate(-100 -100)`} />
          </g>
        </g>
      ))}
    </svg>
  );
}

/** The mark and the name together, for the corner above the sidebar. */
export function MatesWordmark() {
  return (
    <span className="flex items-center gap-2 select-none">
      <MatesLogo size={20} />
      <span className="text-[15px] leading-none font-semibold tracking-[-0.035em] text-ink">
        mates
      </span>
    </span>
  );
}
