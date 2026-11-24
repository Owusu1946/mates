import { memo } from "react";
import type { Mate, Message } from "../data/sampleCrew.ts";
import { ApprovalCard } from "./cards/ApprovalCard.tsx";
import { BriefCard } from "./cards/BriefCard.tsx";
import { RunCard } from "./cards/RunCard.tsx";
import { MateAvatar } from "./MateAvatar.tsx";

type MessageRowProps = {
  message: Message;
  /** The mate who wrote it; none for your own messages. */
  mate?: Mate;
  /** Name the mate above its words: in groups, when the speaker changes. */
  showAuthor: boolean;
  onAnswer: (messageId: string, state: "allowed" | "skipped") => void;
};

/**
 * One message. Yours sit in a bubble on the right (T3 Code's TimelineUserMessageRow); a mate's
 * words sit plainly on the canvas. Memoised so a streaming reply re-renders only its own row.
 */
export const MessageRow = memo(function MessageRow({ message, mate, showAuthor, onAnswer }: MessageRowProps) {
  return (
    <>
      {message.day && (
        <div className="flex items-center gap-3 py-2 text-2xs font-medium text-ink-soft" role="separator">
          <span className="h-px flex-1 bg-line" />
          {message.day}
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
      {message.author === "me" ? (
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-2xl bg-bubble px-4 py-2.5 leading-relaxed wrap-anywhere whitespace-pre-wrap select-text">{message.text}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {showAuthor && mate && (
            <div className="flex items-center gap-2 text-xs font-medium">
              <MateAvatar mate={mate} size={18} />
              {mate.name}
            </div>
          )}
          {message.text && <p className="leading-relaxed wrap-anywhere whitespace-pre-wrap select-text">{message.text}</p>}
          {message.card?.type === "brief" && <BriefCard card={message.card} />}
          {message.card?.type === "approval" && <ApprovalCard card={message.card} onAnswer={(state) => onAnswer(message.id, state)} />}
          {message.card?.type === "run" && <RunCard card={message.card} />}
        </div>
      )}
    </>
  );
});
