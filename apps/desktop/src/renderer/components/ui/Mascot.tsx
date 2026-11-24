import PolygonAvatar, { DEFAULT_GRADIENT, shapeOf, type PolygonState, type ShapeName } from "@muse-clone/mascot";
import { useReducedMotion } from "../../hooks/useReducedMotion.ts";
import type { Gradient } from "../../theme/matePalette.ts";

type MascotProps = {
  size: number;
  state?: PolygonState;
  gradient?: Gradient;
  shape?: ShapeName;
  /** Hold still: small previews, and lists of many mascots at once. */
  still?: boolean;
};

/** A mate's face, from the shared mascot engine. It holds still when the system asks for less motion. */
export function Mascot({ size, state = "idle", gradient = DEFAULT_GRADIENT, shape = "hexagon", still = false }: MascotProps) {
  const reduced = useReducedMotion();
  return <PolygonAvatar size={size} state={state} gradient={gradient} shape={shapeOf(shape)} title={null} paused={still || reduced} />;
}
