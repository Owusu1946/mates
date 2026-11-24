import { MateAvatar } from "../chat/MateAvatar.tsx";
import type { Mate } from "../data/sampleCrew.ts";

/**
 * A group's face: its first two mates' mascots overlapping, as in the phone app, with a count when
 * there are more. A mate that's busy in the group still shows it.
 */
export function GroupFace({ mates }: { mates: Mate[] }) {
  const [first, second] = mates;
  const more = mates.length - 2;
  return (
    <span className="relative block size-9">
      {first && (
        <span className="absolute top-0 left-0">
          <MateAvatar mate={first} size={24} />
        </span>
      )}
      {second && (
        <span className="absolute right-0 bottom-0 rounded-full bg-rail">
          <MateAvatar mate={second} size={24} />
        </span>
      )}
      {more > 0 && (
        <span className="absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-rail bg-hover-fill px-1 text-[9px] font-semibold text-ink-soft tabular-nums">+{more}</span>
      )}
    </span>
  );
}
