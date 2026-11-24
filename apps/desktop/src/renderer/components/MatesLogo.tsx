import { useId, type CSSProperties } from "react";
import { MATE_PALETTE } from "../theme/matePalette.ts";

/**
 * The Mates logo, as brand/mates-mark.svg draws it (brand/generate.mjs): three of the mascot's
 * rounded hexagons locked like a honeycomb, in the app's amber, blue and green. On first paint the
 * three step in from the middle, once.
 */

// The mascot's silhouette, centred on 100,100 (brand/generate.mjs HEX).
const HEX =
  "M94.91 4.94Q100 2 105.09 4.94L179.78 48.06Q184.87 51 184.87 56.88L184.87 143.12Q184.87 149 179.78 151.94L105.09 195.06Q100 198 94.91 195.06L20.22 151.94Q15.13 149 15.13 143.12L15.13 56.88Q15.13 51 20.22 48.06Z";
const SCALE = 0.405;

const CELLS = [
  { x: 100, y: 68.45, colors: MATE_PALETTE.amber },
  { x: 63.57, y: 131.55, colors: MATE_PALETTE.blue },
  { x: 136.43, y: 131.55, colors: MATE_PALETTE.green },
];

export function MatesLogo({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="20 22 160 156" aria-hidden="true" className="shrink-0 overflow-visible">
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
          <g className="logo-cell" style={{ "--from-x": `${(100 - cell.x) * 0.5}px`, "--from-y": `${(100 - cell.y) * 0.5}px` } as CSSProperties}>
            <path d={HEX} fill={`url(#${id}-${index})`} transform={`scale(${SCALE}) translate(-100 -100)`} />
          </g>
        </g>
      ))}
    </svg>
  );
}

/**
 * The logo and the name, filling the corner above the sidebar. "mates" is set in Bricolage
 * Grotesque at its display optical size, whose ink traps give it its own voice, so it reads as a
 * wordmark rather than a label.
 */
export function MatesWordmark() {
  return (
    <span className="flex items-center gap-2.5 select-none" aria-label="Mates">
      <MatesLogo size={28} />
      <span aria-hidden="true" className="pb-0.5 font-display text-[28px] leading-none font-bold tracking-[-0.02em] text-ink [font-variation-settings:'opsz'_96]">
        mates
      </span>
    </span>
  );
}
