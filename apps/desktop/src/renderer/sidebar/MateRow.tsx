import { MateAvatar } from "../chat/MateAvatar.tsx";
import type { Chat, Mate } from "../data/sampleCrew.ts";
import { ChatRow } from "./ChatRow.tsx";

type MateRowProps = {
  chat: Chat;
  mate: Mate;
  selected: boolean;
  unread: boolean;
  jump: number | null;
  onSelect: () => void;
};

/** What a mate is up to, in place of its last message while it's doing something. */
function subtitleFor(mate: Mate, chat: Chat) {
  switch (mate.status) {
    case "waiting":
      return <span className="text-caution-ink">Needs you</span>;
    case "thinking":
      return <span className="shimmer">Thinking…</span>;
    case "listening":
      return "Listening…";
    case "working":
      // Plain text: a shimmer repaints every frame, too costly to leave running in a list.
      return mate.step ?? "Writing…";
    default:
      return chat.preview;
  }
}

/** A mate in the sidebar: its face shows its mood, and the line under its name what it's doing. */
export function MateRow({ chat, mate, selected, unread, jump, onSelect }: MateRowProps) {
  return <ChatRow face={<MateAvatar mate={mate} size={34} />} title={chat.title} subtitle={subtitleFor(mate, chat)} time={chat.time} unread={unread} selected={selected} jump={jump} onSelect={onSelect} />;
}
