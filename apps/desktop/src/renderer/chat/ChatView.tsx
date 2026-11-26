import type { Dispatch, ReactNode, Ref } from "react";
import { RightPanel } from "../code/RightPanel.tsx";
import type { Chat, Mate, Message } from "../data/sampleCrew.ts";
import { REPLIES, VOICE_LINES } from "../data/sampleCrew.ts";
import { cannedReply, type ChatAction, type ChatFlow } from "./chatFlow.logic.ts";
import { ChatComposer } from "./ChatComposer.tsx";
import { ChatHeader, type SidePanel } from "./ChatHeader.tsx";
import type { MessageAction } from "./MessageActions.tsx";
import { answererFor, pinnedOf, quoteOf } from "./messageActions.logic.ts";
import { MessagesTimeline } from "./MessagesTimeline.tsx";
import type { SentFile } from "./attachments.logic.ts";
import { mentionChoices, tagsOf, type MentionPicks } from "./mentions.logic.ts";
import { PinnedBar } from "./PinnedBar.tsx";
import { usableApps } from "../settings/apps.logic.ts";
import { useApps } from "../settings/apps.ts";

type ChatViewProps = {
  chat: Chat;
  /** Mates as they are right now (a reply in progress shows in the header). */
  mates: Record<string, Mate>;
  /** Mates for the timeline, which don't change while a reply streams. */
  timelineMates: Record<string, Mate>;
  flow: ChatFlow;
  dispatch: Dispatch<ChatAction>;
  composerRef: Ref<HTMLTextAreaElement>;
  quiet: boolean;
  /** The Call or Computer panel beside the chat, drawn by the layout. */
  side: SidePanel;
  sidePanel: ReactNode;
  inCall: boolean;
  computerBusy: boolean;
  onSide: (side: SidePanel) => void;
  onEdit: () => void;
};

/**
 * One chat: header, timeline and composer, with the Call or Computer panel beside it. Keyed by
 * chat, so switching starts fresh and fades in.
 */
export function ChatView({ chat, mates, timelineMates, flow, dispatch, composerRef, quiet, side, sidePanel, inCall, computerBusy, onSide, onEdit }: ChatViewProps) {
  const lead = mates[chat.leadId]!;
  const reply = flow.replies[chat.id];
  const messages = flow.messages[chat.id] ?? [];
  const replying = flow.replying[chat.id];
  const nameOf = (author: string) => (author === "me" ? "You" : (mates[author]?.name ?? ""));
  // Whoever you replied to answers; otherwise the lead does.
  const answerer = (quote = replying) => answererFor(quote, chat.mateIds, chat.leadId);
  const canned = (mateId: string) => cannedReply(REPLIES, mateId, flow.sent);
  const apps = useApps();
  const connected = usableApps(apps);
  // A mate you @-mention in the chat answers first; then whoever you replied to; then the lead.
  const answererWith = (picks: MentionPicks) => picks.mates.find((mate) => chat.mateIds.includes(mate.id))?.id ?? answerer();
  const sendWith = (picks: MentionPicks, files: SentFile[]) => {
    const mateId = answererWith(picks);
    dispatch({ type: "send", chatId: chat.id, mateId, reply: canned(mateId), files, tags: tagsOf(picks) });
  };
  const mentions = {
    mateOf: (id: string) => mates[id],
    appOf: (slug: string) => apps.find((app) => app.slug === slug),
    hint: chat.kind === "mate" ? "Mentioning a mate shares this chat with them." : undefined,
    choicesFor: (query: string, picks: MentionPicks) =>
      mentionChoices({
        query,
        kind: chat.kind,
        primaryMateId: chat.leadId,
        members: chat.mateIds.map((id) => mates[id]!).filter(Boolean),
        ownedMates: Object.values(mates),
        connectedApps: connected,
        picks,
      }),
  };
  const focusComposer = () => requestAnimationFrame(() => composerRef && "current" in composerRef && composerRef.current?.focus());

  const onAction = (message: Message, action: MessageAction) => {
    const target = { chatId: chat.id, messageId: message.id };
    if (action.type === "reply") {
      dispatch({ type: "reply", chatId: chat.id, quote: quoteOf(message) });
      focusComposer();
    } else if (action.type === "pin") dispatch({ type: "pin", ...target });
    else if (action.type === "rate") dispatch({ type: "rate", ...target, rating: action.rating });
    else if (action.type === "version") dispatch({ type: "version", ...target, index: action.index });
    else if (action.type === "regenerate") dispatch({ type: "regenerate", ...target, reply: canned(message.author) });
    else if (action.type === "retry") dispatch({ type: "retry", ...target, mateId: answerer(message.replyTo), reply: canned(answerer(message.replyTo)) });
  };
  const editMessage = (message: Message, text: string) => {
    const mateId = answerer(message.replyTo);
    dispatch({ type: "edit", chatId: chat.id, messageId: message.id, text, mateId, reply: canned(mateId) });
  };
  return (
    <div data-run-row className="flex h-full min-w-0 animate-fade">
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          chat={chat}
          lead={lead}
          mates={chat.mateIds.map((id) => mates[id]!)}
          side={side}
          inCall={inCall}
          computerBusy={computerBusy}
          onCall={() => onSide(side === "call" ? null : "call")}
          onComputer={() => onSide(side === "computer" ? null : "computer")}
          onEdit={onEdit}
        />
        <PinnedBar pinned={pinnedOf(messages)} nameOf={nameOf} onUnpin={(message) => dispatch({ type: "pin", chatId: chat.id, messageId: message.id })} />
        <MessagesTimeline
          chatId={chat.id}
          messages={messages}
          reply={reply}
          quiet={quiet}
          activity={lead.status === "working" && !reply ? lead.step : undefined}
          mates={timelineMates}
          group={chat.kind === "group"}
          onAnswer={(messageId, state) => dispatch({ type: "answer", chatId: chat.id, messageId, state })}
          onCard={(messageId, card) => dispatch({ type: "card", chatId: chat.id, messageId, card })}
          onAction={onAction}
          onEdit={editMessage}
          composer={(
            <ChatComposer
              ref={composerRef}
              draft={flow.drafts[chat.id] ?? ""}
              placeholder={chat.kind === "group" ? `Message ${chat.title}` : `Message ${lead.name}`}
              busy={Boolean(reply)}
              onDraft={(text) => dispatch({ type: "draft", chatId: chat.id, text })}
              onSend={(files, picks) => sendWith(picks, files)}
              mentions={mentions}
              attachments
              replyingTo={replying && { quote: replying, mate: mates[replying.author], onCancel: () => dispatch({ type: "reply", chatId: chat.id, quote: null }) }}
              onStop={() => dispatch({ type: "stop", chatId: chat.id })}
              voice={{
                line: VOICE_LINES[chat.leadId] ?? "What's on my calendar today",
                onSend: (text, files, picks) => {
                  dispatch({ type: "draft", chatId: chat.id, text });
                  sendWith(picks, files);
                },
              }}
            />
          )}
        />
      </div>
      <RightPanel open={side !== null} tabs={side === "call" ? [{ id: "call", label: "Call", icon: "phone" }] : [{ id: "computer", label: "Computer", icon: "monitor" }]} active={side ?? "computer"} onClose={() => onSide(null)}>
        {sidePanel}
      </RightPanel>
    </div>
  );
}
