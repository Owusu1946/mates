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
import { useRevealedText } from "./useRevealedText.ts";
import { QuietActivityContext } from "./WorkActivity.tsx";
import { Button } from "../components/ui/Button.tsx";

/** A reply being written: its words shown smoothly as they arrive (useRevealedText), no actions until it settles. */
function LiveMessageRow({ message, ...row }: Omit<Parameters<typeof MessageRow>[0], "actions">) {
  const text = useRevealedText(message.text);
  return <MessageRow {...row} message={text === message.text ? message : { ...message, text }} />;
}

/** The shape of a conversation while the first page loads: a few lines on each side, holding still. */
function HistorySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading messages" className="flex flex-col gap-5 py-4">
      {[64, 40, 72, 52].map((width, index) => (
        <span key={index} className={`h-4 rounded-full bg-hover-fill motion-safe:animate-pulse ${index % 2 ? "self-start" : "self-end"}`} style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

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
  /** The chat's history: older messages left to load, and whether they're loading. */
  history?: { loading: boolean; error: string | null; hasMore: boolean; loadingEarlier: boolean; onLoadEarlier: () => void; onRetry: () => void };
};

export function MessagesTimeline({ chatId, messages, reply, mates, group, quiet, activity, composer, onAnswer, onCard, onAction, onEdit, history }: MessagesTimelineProps) {
  const streamed = reply?.phase === "streaming" ? shownText(reply) : "";
  const lastAuthor = messages.at(-1)?.author;
  const regenerable = regenerableId(messages);
  const latestReply = messages.findLast((message) => message.author !== "me")?.id;
  const busy = Boolean(reply) || messages.some((message) => message.live);
  // What's at the end: changes with a new message or streaming words, not with older pages loading above.
  const tail = messages.at(-1);
  // Stable, so the memoised rows don't all re-render as a reply streams.
  const act = useStableCallback(onAction);
  const edit = useStableCallback(onEdit);
  const changeCard = useStableCallback(onCard);
  const mateOf = useStableCallback((author: string) => mates[author]);

  return (
    <TimelineViewport scrollKey={chatId} contentKey={`${tail?.id ?? ""}:${tail?.text.length ?? 0}:${tail?.live ? 1 : 0}:${streamed.length}:${reply?.phase}`} followLatest={lastAuthor === "me"} composer={composer} onNearTop={history?.hasMore ? history.onLoadEarlier : undefined}>
      <CardMatesContext value={mates}>
      <QuietActivityContext value={quiet}>
      <div className="mx-auto flex w-full max-w-(--chat-max-width) flex-col gap-4 px-6 pt-6 pb-5">
        {history?.hasMore && (
          <div className="flex justify-center py-1">
            <Button variant="ghost-muted" size="xs" disabled={history.loadingEarlier} onClick={history.onLoadEarlier}>
              {history.loadingEarlier ? "Loading earlier messages…" : "Load earlier messages"}
            </Button>
          </div>
        )}
        {history?.loading && !messages.length && <HistorySkeleton />}
        {history?.error && !messages.length && (
          <div role="alert" className="flex flex-col items-center gap-2 py-10 text-center text-sm text-ink-soft">
            {history.error}
            <Button variant="outline" size="xs" onClick={history.onRetry}>
              Try again
            </Button>
          </div>
        )}
        {messages.map((message, index) => {
          // Asked again: the new answer streams where the old one was.
          const asking = reply?.target === message.id;
          if (asking && reply.phase === "thinking" && mates[reply.mateId]) return <ActivityLine key={message.id} mate={mates[reply.mateId]!} />;
          // A reply being written: thinking until its words come, with what the mate is doing.
          // Thinking only until its first words or its progress arrive; then the row shows them.
          if (message.live && !message.text.trim() && !message.cards?.length && mates[message.author])
            return (
              <div key={message.id} className="flex flex-col gap-2">
                {!quiet && message.step && <ChatWorkActivity steps={[message.step]} />}
                <ActivityLine mate={mates[message.author]!} />
              </div>
            );
          // Words being written flow in smoothly; only this row re-renders as they do.
          if (message.live)
            return <LiveMessageRow key={message.id} message={message} mate={mates[message.author]} showAuthor={group && (Boolean(message.day) || messages[index - 1]?.author !== message.author)} onAnswer={onAnswer} />;
          return (
            <MessageRow
              key={message.id}
              message={asking ? { ...message, text: streamed } : message}
              mate={mates[message.author]}
              showAuthor={group && message.author !== "me" && (Boolean(message.day) || messages[index - 1]?.author !== message.author)}
              onAnswer={onAnswer}
              onCard={changeCard}
              actions={asking || message.live ? undefined : { onAction: act, replyable: group, regenerable: message.id === regenerable, latest: message.id === latestReply, busy }}
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
      </QuietActivityContext>
      </CardMatesContext>
    </TimelineViewport>
  );
}
