import PolygonAvatar, { DEFAULT_GRADIENT, shapeOf, type PolygonState, type ShapeName } from "@muse-clone/mascot";
import { useMotionBeat, useOnScreen, usePageVisible } from "../../hooks/useMascotMotion.ts";
import { useReducedMotion } from "../../hooks/useReducedMotion.ts";
import { frameIntervalFor, isLowEnd, shouldAnimate } from "../../theme/mascotMotion.logic.ts";
import type { Gradient } from "../../theme/matePalette.ts";

type MascotProps = {
  size: number;
  state?: PolygonState;
  gradient?: Gradient;
  shape?: ShapeName;
  /** Never move: small previews, pickers. */
  still?: boolean;
};

// Read once: the machine doesn't change while the app runs.
const lowEnd = isLowEnd({ cores: navigator.hardwareConcurrency, memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory });

/**
 * A mate's face, from the shared mascot engine, kept cheap enough for a sidebar full of them on
 * the lowest-end PC (theme/mascotMotion.logic.ts): it moves only while it's on screen, the window
 * is visible and motion is allowed; small faces draw fewer frames; and an idle face plays a new
 * state for a beat, then holds still, and its animation loop sleeps.
 */
export function Mascot({ size, state = "idle", gradient = DEFAULT_GRADIENT, shape = "hexagon", still = false }: MascotProps) {
  const [ref, onScreen] = useOnScreen<HTMLSpanElement>();
  const pageVisible = usePageVisible();
  const reducedMotion = useReducedMotion();
  const beat = useMotionBeat(state);
  const animate = shouldAnimate({ state, size, onScreen, pageVisible, reducedMotion, beat, still });
  return (
    <span ref={ref} className="inline-flex shrink-0" style={{ width: size, height: size }}>
      <PolygonAvatar size={size} state={state} gradient={gradient} shape={shapeOf(shape)} title={null} paused={!animate} frameInterval={frameIntervalFor(size, lowEnd)} />
    </span>
  );
}
