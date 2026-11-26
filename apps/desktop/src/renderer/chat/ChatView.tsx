import type { Dispatch, ReactNode, Ref } from "react";
import { RightPanel } from "../code/RightPanel.tsx";
import type { Chat, Mate, Message } from "../data/sampleCrew.ts";
import { VOICE_LINES } from "../data/sampleCrew.ts";
import type { ChatAction, ChatFlow } from "./chatFlow.logic.ts";
import { ChatComposer } from "./ChatComposer.tsx";
import { ChatHeader, type SidePanel } from "./ChatHeader.tsx";
import type { MessageAction } from "./MessageActions.tsx";
import { pinnedOf, quoteOf } from "./messageActions.logic.ts";
import { MessagesTimeline } from "./MessagesTimeline.tsx";
import { mentionChoices, type MentionPicks } from "./mentions.logic.ts";
import { PinnedBar } from "./PinnedBar.tsx";
import { stableRows } from "./stableRows.ts";
import { useAuth } from "@clerk/electron/react";
import { useFeedback } from "../remote/feedback.ts";
import { toggleMessagePin, useMessagePins } from "../remote/messagePins.ts";
import { useRunWatch, useWatching } from "../remote/runWatch.ts";
import { useChatActions } from "../remote/send.ts";
import { useThread } from "../remote/thread.ts";
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
  // The chat's real history, with what you send and what streams back (remote/thread.ts, send.ts).
  const thread = useThread(chat.id, chat.leadId);
  const actions = useChatActions(chat.id);
  useRunWatch(chat.id);
  useWatching(chat.id);
  const feedback = useFeedback();
  const { userId } = useAuth();
  const pins = useMessagePins(userId, chat.id);
  const togglePin = (message: Message) => userId && toggleMessagePin(userId, chat.id, message.sourceId ?? message.id);
  // What only this device knows about a row: a send that didn't go, your thumbs on a reply, your pins.
  const fromApi = thread.rows.map((message) => {
    const rating = message.author !== "me" ? feedback.ratings[message.sourceId ?? message.id] : undefined;
    const failed = actions.failed.get(message.id);
    const pinned = pins.includes(message.sourceId ?? message.id);
    return failed || rating || pinned ? { ...message, ...(failed ? { failed: true, failedReason: failed } : {}), ...(rating ? { rating } : {}), ...(pinned ? { pinned } : {}) } : message;
  });
  // Notes only this window made (a call's summary, a hand-off from the summon bar) follow the real messages.
  // Rows that didn't change stay the same objects, so a streamed word draws only its own row.
  const messages = stableRows(chat.id, [...fromApi, ...(flow.messages[chat.id] ?? [])]);
  // One reply at a time per chat, as the API allows.
  const busy = messages.some((message) => message.live);
  const replying = flow.replying[chat.id];
  const nameOf = (author: string) => (author === "me" ? "You" : (mates[author]?.name ?? ""));
  const apps = useApps();
  const connected = usableApps(apps);
  // The draft goes to the API; the composer clears at once, and a send that fails stays in the chat to try again.
  const sendDraft = (text = flow.drafts[chat.id] ?? "") => {
    if (!text.trim() || busy) return;
    void actions.send(text.trim());
    dispatch({ type: "draft", chatId: chat.id, text: "" });
    dispatch({ type: "reply", chatId: chat.id, quote: null });
  };
  // The stored message a row shows, and the one it answers.
  const sourceOf = (message: Message) => message.sourceId ?? message.id;
  const parentOf = (message: Message) => thread.thread?.items.find((item) => item.message.id === sourceOf(message))?.parentId ?? null;
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
    if (action.type === "reply") {
      dispatch({ type: "reply", chatId: chat.id, quote: quoteOf(message) });
      focusComposer();
    } else if (action.type === "pin") togglePin(message);
    else if (action.type === "rate") void feedback.rate(message.sourceId ?? message.id, action.rating, action.reason);
    else if (action.type === "version") {
      const version = message.versionIds?.[action.index];
      if (version) thread.showVersion(version);
    } else if (action.type === "regenerate") {
      const question = parentOf(message);
      if (question) void actions.regenerate(question);
    } else if (action.type === "retry") void actions.retry(message.id);
  };
  const editMessage = (message: Message, text: string) => void actions.edit(sourceOf(message), text.trim());
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
        <PinnedBar pinned={pinnedOf(messages)} nameOf={nameOf} onUnpin={togglePin} />
        <MessagesTimeline
          chatId={chat.id}
          messages={messages}
          quiet={quiet}
          mates={timelineMates}
          group={chat.kind === "group"}
          onAnswer={(messageId, state) => dispatch({ type: "answer", chatId: chat.id, messageId, state })}
          onCard={(messageId, card) => dispatch({ type: "card", chatId: chat.id, messageId, card })}
          onAction={onAction}
          onEdit={editMessage}
          history={{ loading: thread.loading, error: thread.error, hasMore: thread.hasMore, loadingEarlier: thread.loadingEarlier, onLoadEarlier: thread.loadEarlier, onRetry: thread.refresh }}
          composer={(
            <ChatComposer
              ref={composerRef}
              draft={flow.drafts[chat.id] ?? ""}
              placeholder={chat.kind === "group" ? `Message ${chat.title}` : `Message ${lead.name}`}
              busy={busy}
              onDraft={(text) => dispatch({ type: "draft", chatId: chat.id, text })}
              onSend={() => sendDraft()}
              mentions={mentions}
              replyingTo={replying && { quote: replying, mate: mates[replying.author], onCancel: () => dispatch({ type: "reply", chatId: chat.id, quote: null }) }}
              onStop={() => void actions.stop()}
              voice={{
                line: VOICE_LINES[chat.leadId] ?? "What's on my calendar today",
                onSend: (text) => sendDraft(text),
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
