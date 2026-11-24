import type { Mate } from "../data/sampleCrew.ts";
import { MateAvatar } from "./MateAvatar.tsx";

/** "Esi is thinking…" under the last message, while a mate works out its answer. */
export function ActivityLine({ mate }: { mate: Mate }) {
  return (
    <div className="flex animate-fade items-center gap-2 text-sm" role="status">
      <MateAvatar mate={{ ...mate, status: "thinking" }} size={18} />
      <span className="shimmer">{mate.name} is thinking…</span>
    </div>
  );
}
