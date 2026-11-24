import { Tooltip } from "../components/ui/Tooltip.tsx";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import type { Chat, Mate } from "../data/sampleCrew.ts";
import { SidebarRow } from "./SidebarRow.tsx";

type MateRowProps = {
  chat: Chat;
  mate: Mate;
  selected: boolean;
  unread: boolean;
  jump: number | null;
  onSelect: () => void;
};

/** A mate in the sidebar. Its face moves only while it's busy; hovering says what it's on. */
export function MateRow({ chat, mate, selected, unread, jump, onSelect }: MateRowProps) {
  return (
    <Tooltip
      content={
        <>
          <div className="font-medium">
            {mate.name} <span className="font-normal text-ink-soft">· {mate.role}</span>
          </div>
          <div className="mt-0.5 text-ink-soft">{mate.step ?? chat.preview}</div>
        </>
      }
    >
      <SidebarRow leading={<MateAvatar mate={mate} />} label={chat.title} selected={selected} unread={unread} jump={jump} meta={mate.status === "idle" ? chat.time : <span className="shimmer">{mate.status === "waiting" ? "needs you" : mate.status}</span>} onClick={onSelect} />
    </Tooltip>
  );
}
