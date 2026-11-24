import { SHAPES, type ShapeName } from "@muse-clone/mascot";
import type { CSSProperties } from "react";
import { gradientOf, MATE_COLORS, type MateColor } from "../theme/matePalette.ts";
import { Mascot } from "./ui/Mascot.tsx";

const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];

/** Choose a mate's shape: each option is the mascot itself, in the chosen colour. */
export function ShapePicker({ shape, color, onChange, size = 34 }: { shape: ShapeName; color: MateColor; onChange: (shape: ShapeName) => void; size?: number }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Shape">
      {SHAPE_NAMES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === shape}
          aria-label={option}
          className="flex items-center justify-center rounded-full p-1.5 transition-colors hover:bg-hover-fill aria-checked:bg-hover-fill aria-checked:ring-1 aria-checked:ring-line"
          onClick={() => onChange(option)}
        >
          <Mascot size={size} gradient={gradientOf(color)} shape={option} still />
        </button>
      ))}
    </div>
  );
}

/** Choose a mate's colour from the mascot palette. */
export function ColorPicker({ color, onChange }: { color: MateColor; onChange: (color: MateColor) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Colour">
      {MATE_COLORS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === color}
          aria-label={option}
          className="size-8.5 rounded-full border-2 border-transparent bg-[radial-gradient(circle,var(--swatch)_0_11px,transparent_12px)] transition-colors aria-checked:border-ink"
          style={{ "--swatch": gradientOf(option)[1] } as CSSProperties}
          onClick={() => onChange(option)}
        />
      ))}
    </div>
  );
}
