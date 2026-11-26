import type { ReactNode } from "react";
import type { Card, Mate, Message } from "../data/sampleCrew.ts";
import { CardMatesContext } from "./cards/CardParts.tsx";
import { useStableCallback } from "../hooks/useStableCallback.ts";
import { ActivityLine } from "./ActivityLine.tsx";
import { ChatWorkActivity } from "./ChatWorkActivity.tsx";
import { shownText, type Reply } from "./chatFlow.logic.ts";
import type { MessageAction } from "./MessageActions.tsx";
import { regenerableId } from "./messageActions.logic.ts";
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
  onCard: (messageId: string, card: Card) => void;
  onAction: (message: Message, action: MessageAction) => void;
  onEdit: (message: Message, text: string) => void;
};

export function MessagesTimeline({ chatId, messages, reply, mates, group, quiet, activity, composer, onAnswer, onCard, onAction, onEdit }: MessagesTimelineProps) {
  const streamed = reply?.phase === "streaming" ? shownText(reply) : "";
  const lastAuthor = messages.at(-1)?.author;
  const regenerable = regenerableId(messages);
  const latestReply = messages.findLast((message) => message.author !== "me")?.id;
  const busy = Boolean(reply);
  // Stable, so the memoised rows don't all re-render as a reply streams.
  const act = useStableCallback(onAction);
  const edit = useStableCallback(onEdit);
  const changeCard = useStableCallback(onCard);
  const mateOf = useStableCallback((author: string) => mates[author]);

  return (
    <TimelineViewport scrollKey={chatId} contentKey={`${messages.length}:${streamed.length}:${reply?.phase}`} followLatest={lastAuthor === "me"} composer={composer}>
      <CardMatesContext value={mates}>
      <div className="mx-auto flex w-full max-w-(--chat-max-width) flex-col gap-4 px-6 pt-6 pb-5">
        {messages.map((message, index) => {
          // Asked again: the new answer streams where the old one was.
          const asking = reply?.target === message.id;
          if (asking && reply.phase === "thinking" && mates[reply.mateId]) return <ActivityLine key={message.id} mate={mates[reply.mateId]!} />;
          return (
            <MessageRow
              key={message.id}
              message={asking ? { ...message, text: streamed } : message}
              mate={mates[message.author]}
              showAuthor={group && message.author !== "me" && (Boolean(message.day) || messages[index - 1]?.author !== message.author)}
              onAnswer={onAnswer}
              onCard={changeCard}
              actions={asking ? undefined : { onAction: act, replyable: group, regenerable: message.id === regenerable, latest: message.id === latestReply, busy }}
              mateOf={mateOf}
              onEdit={edit}
            />
          );
        })}
        {!quiet && activity && <ChatWorkActivity steps={[activity]} />}
        {!quiet && reply?.phase === "thinking" && !reply.target && mates[reply.mateId] && <ActivityLine mate={mates[reply.mateId]!} />}
        {reply?.phase === "streaming" && !reply.target && (
          <MessageRow message={{ id: "live", author: reply.mateId, text: streamed }} mate={mates[reply.mateId]} showAuthor={group && lastAuthor !== reply.mateId} onAnswer={onAnswer} />
        )}
      </div>
      </CardMatesContext>
    </TimelineViewport>
  );
}
