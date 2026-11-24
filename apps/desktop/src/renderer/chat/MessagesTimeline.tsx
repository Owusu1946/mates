import type { Mate, Message } from "../data/sampleCrew.ts";
import { ActivityLine } from "./ActivityLine.tsx";
import { shownText, type Reply } from "./chatFlow.logic.ts";
import { MessageRow } from "./MessageRow.tsx";
import { useTimelineScroll } from "./useTimelineScroll.ts";

type MessagesTimelineProps = {
  chatId: string;
  messages: Message[];
  reply?: Reply;
  mates: Record<string, Mate>;
  group: boolean;
  quiet: boolean;
  activity?: string;
  onAnswer: (messageId: string, state: "allowed" | "skipped") => void;
};

export function MessagesTimeline({ chatId, messages, reply, mates, group, quiet, activity, onAnswer }: MessagesTimelineProps) {
  const streamed = reply?.phase === "streaming" ? shownText(reply) : "";
  const lastAuthor = messages.at(-1)?.author;
  const { scroller, onScroll } = useTimelineScroll(chatId, `${messages.length}:${streamed.length}:${reply?.phase}`, lastAuthor === "me");

  return (
    <div
      ref={scroller}
      tabIndex={-1}
      data-focus-area="timeline"
      className="min-h-0 flex-1 overflow-y-auto outline-none"
      onScroll={onScroll}
    >
      <div className="mx-auto flex max-w-(--chat-max-width) flex-col gap-5 px-6 pt-6 pb-8">
        {messages.map((message, index) => (
          <MessageRow
            key={message.id}
            message={message}
            mate={mates[message.author]}
            showAuthor={group && message.author !== "me" && (Boolean(message.day) || messages[index - 1]?.author !== message.author)}
            onAnswer={onAnswer}
          />
        ))}
        {quiet && activity && (
          <details className="self-start rounded-md text-xs text-ink-soft">
            <summary className="cursor-pointer rounded-md px-1 py-1.5 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">View activity</summary>
            <p className="mt-1 border-l border-line pl-3">{activity}</p>
          </details>
        )}
        {!quiet && activity && <p className="text-xs text-ink-soft" role="status">{activity}</p>}
        {!quiet && reply?.phase === "thinking" && mates[reply.mateId] && <ActivityLine mate={mates[reply.mateId]!} />}
        {reply?.phase === "streaming" && (
          <MessageRow message={{ id: "live", author: reply.mateId, text: streamed }} mate={mates[reply.mateId]} showAuthor={group && lastAuthor !== reply.mateId} onAnswer={onAnswer} />
        )}
      </div>
    </div>
  );
}
