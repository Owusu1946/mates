import type { Dispatch, ReactNode, Ref } from "react";
import { RightPanel } from "../code/RightPanel.tsx";
import type { Chat, Mate } from "../data/sampleCrew.ts";
import { REPLIES, VOICE_LINES } from "../data/sampleCrew.ts";
import { cannedReply, type ChatAction, type ChatFlow } from "./chatFlow.logic.ts";
import { ChatComposer } from "./ChatComposer.tsx";
import { ChatHeader, type SidePanel } from "./ChatHeader.tsx";
import { MessagesTimeline } from "./MessagesTimeline.tsx";

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
        <MessagesTimeline
          chatId={chat.id}
          messages={flow.messages[chat.id] ?? []}
          reply={reply}
          quiet={quiet}
          activity={lead.status === "working" && !reply ? lead.step : undefined}
          mates={timelineMates}
          group={chat.kind === "group"}
          onAnswer={(messageId, state) => dispatch({ type: "answer", chatId: chat.id, messageId, state })}
          onCard={(messageId, card) => dispatch({ type: "card", chatId: chat.id, messageId, card })}
          composer={(
            <ChatComposer
              ref={composerRef}
              draft={flow.drafts[chat.id] ?? ""}
              placeholder={chat.kind === "group" ? `Message ${chat.title}` : `Message ${lead.name}`}
              busy={Boolean(reply)}
              onDraft={(text) => dispatch({ type: "draft", chatId: chat.id, text })}
              onSend={(files) => dispatch({ type: "send", chatId: chat.id, mateId: chat.leadId, reply: cannedReply(REPLIES, chat.leadId, flow.sent), files })}
              attachments
              onStop={() => dispatch({ type: "stop", chatId: chat.id })}
              voice={{
                line: VOICE_LINES[chat.leadId] ?? "What's on my calendar today",
                onSend: (text, files) => {
                  dispatch({ type: "draft", chatId: chat.id, text });
                  dispatch({ type: "send", chatId: chat.id, mateId: chat.leadId, reply: cannedReply(REPLIES, chat.leadId, flow.sent), files });
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
