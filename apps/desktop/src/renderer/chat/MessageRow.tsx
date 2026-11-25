import { memo } from "react";
import { Icon } from "../components/ui/Icon.tsx";
import type { Mate, Message } from "../data/sampleCrew.ts";
import type { Card } from "../data/sampleCrew.ts";
import { MessageCard } from "./cards/MessageCard.tsx";
import { MateAvatar } from "./MateAvatar.tsx";

type MessageRowProps = {
  message: Message;
  /** The mate who wrote it; none for your own messages. */
  mate?: Mate;
  /** Name the mate above its words: in groups, when the speaker changes. */
  showAuthor: boolean;
  onAnswer: (messageId: string, state: "allowed" | "skipped") => void;
  /** A card's new state, for cards that change (a plan running, a routine paused). */
  onCard?: (messageId: string, card: Card) => void;
};

/**
 * One message. Yours sit in a bubble on the right (T3 Code's TimelineUserMessageRow); a mate's
 * words sit plainly on the canvas. Memoised so a streaming reply re-renders only its own row.
 */
export const MessageRow = memo(function MessageRow({ message, mate, showAuthor, onAnswer, onCard }: MessageRowProps) {
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
        <div className="flex flex-col items-end gap-1.5">
          {message.files && (
            <ul className="flex max-w-[80%] flex-wrap justify-end gap-1.5" aria-label="Files">
              {message.files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex h-8 max-w-56 items-center gap-1.5 rounded-lg border border-line bg-raised px-2 text-xs">
                  <Icon name="file" size={14} className={file.kind === "pdf" ? "text-danger-ink" : "text-ink-soft"} />
                  <span className="truncate">{file.name}</span>
                </li>
              ))}
            </ul>
          )}
          {message.text && <p className="max-w-[80%] rounded-2xl bg-bubble px-4 py-2.5 leading-relaxed wrap-anywhere whitespace-pre-wrap select-text">{message.text}</p>}
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
          {message.card && <MessageCard card={message.card} authorId={message.author} onAnswer={(state) => onAnswer(message.id, state)} onChange={(card) => onCard?.(message.id, card)} />}
        </div>
      )}
    </>
  );
});
