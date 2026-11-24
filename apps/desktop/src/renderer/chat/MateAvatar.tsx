import type { PolygonState } from "@muse-clone/mascot";
import { Mascot } from "../components/ui/Mascot.tsx";
import type { Mate, MateStatus } from "../data/sampleCrew.ts";
import { gradientOf } from "../theme/matePalette.ts";

const STATE_FOR: Record<MateStatus, PolygonState> = { idle: "idle", listening: "listening", thinking: "thinking", working: "working", waiting: "curious" };

/** A mate's mascot at list size. Only a mate that's busy moves; a list of idle faces holds still. */
export function MateAvatar({ mate, size = 20 }: { mate: Mate; size?: number }) {
  return <Mascot size={size} state={STATE_FOR[mate.status]} gradient={gradientOf(mate.color)} shape={mate.shape} still={mate.status === "idle"} />;
}
