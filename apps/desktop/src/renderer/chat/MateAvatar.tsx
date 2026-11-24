import type { PolygonState } from "@muse-clone/mascot";
import { Mascot } from "../components/ui/Mascot.tsx";
import type { Mate, MateStatus } from "../data/sampleCrew.ts";
import { gradientOf } from "../theme/matePalette.ts";

const STATE_FOR: Record<MateStatus, PolygonState> = { idle: "idle", listening: "listening", thinking: "thinking", working: "working", happy: "happy", waiting: "curious" };

/**
 * A mate's face, showing what it's doing: listening while you type to it, thinking, working,
 * happy when it's done, curious when it needs you. Mascot keeps a list of them cheap.
 */
export function MateAvatar({ mate, size = 20, still = false }: { mate: Mate; size?: number; still?: boolean }) {
  return <Mascot size={size} state={STATE_FOR[mate.status]} gradient={gradientOf(mate.color)} shape={mate.shape} still={still} />;
}
