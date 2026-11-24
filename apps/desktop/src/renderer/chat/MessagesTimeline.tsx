import type { ReactNode } from "react";
import type { Mate, Message } from "../data/sampleCrew.ts";
import { ActivityLine } from "./ActivityLine.tsx";
import { ChatWorkActivity } from "./ChatWorkActivity.tsx";
import { shownText, type Reply } from "./chatFlow.logic.ts";
import { MessageRow } from "./MessageRow.tsx";
import { TimelineViewport } from "./TimelineViewport.tsx";

type MessagesTimelineProps = {
  chatId: string;
  messages: Message[];
  reply?: Reply;
  mates: Record<string, Mate>;
  group: boolean;
  quiet: boolean;
  activity?: string;
  composer: ReactNode;
  onAnswer: (messageId: string, state: "allowed" | "skipped") => void;
};

export function MessagesTimeline({ chatId, messages, reply, mates, group, quiet, activity, composer, onAnswer }: MessagesTimelineProps) {
  const streamed = reply?.phase === "streaming" ? shownText(reply) : "";
  const lastAuthor = messages.at(-1)?.author;

  return (
    <TimelineViewport scrollKey={chatId} contentKey={`${messages.length}:${streamed.length}:${reply?.phase}`} followLatest={lastAuthor === "me"} composer={composer}>
      <div className="mx-auto flex w-full max-w-(--chat-max-width) flex-col gap-5 px-6 pt-6 pb-5">
        {messages.map((message, index) => (
          <MessageRow
            key={message.id}
            message={message}
            mate={mates[message.author]}
            showAuthor={group && message.author !== "me" && (Boolean(message.day) || messages[index - 1]?.author !== message.author)}
            onAnswer={onAnswer}
          />
        ))}
        {!quiet && activity && <ChatWorkActivity steps={[activity]} />}
        {!quiet && reply?.phase === "thinking" && mates[reply.mateId] && <ActivityLine mate={mates[reply.mateId]!} />}
        {reply?.phase === "streaming" && (
          <MessageRow message={{ id: "live", author: reply.mateId, text: streamed }} mate={mates[reply.mateId]} showAuthor={group && lastAuthor !== reply.mateId} onAnswer={onAnswer} />
        )}
      </div>
    </TimelineViewport>
  );
}
