import type { Dispatch, Ref } from "react";
import type { Chat, Mate } from "../data/sampleCrew.ts";
import { REPLIES } from "../data/sampleCrew.ts";
import { cannedReply, type ChatAction, type ChatFlow } from "./chatFlow.logic.ts";
import { ChatComposer } from "./ChatComposer.tsx";
import { ChatHeader } from "./ChatHeader.tsx";
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
};

/** One chat: header, timeline and composer. Keyed by chat, so switching starts fresh and fades in. */
export function ChatView({ chat, mates, timelineMates, flow, dispatch, composerRef, quiet }: ChatViewProps) {
  const lead = mates[chat.leadId]!;
  const reply = flow.replies[chat.id];
  return (
    <div className="flex h-full animate-fade flex-col">
      <ChatHeader chat={chat} lead={lead} mates={chat.mateIds.map((id) => mates[id]!)} />
      <MessagesTimeline
        chatId={chat.id}
        messages={flow.messages[chat.id] ?? []}
        reply={reply}
        quiet={quiet}
        activity={lead.status === "working" && !reply ? lead.step : undefined}
        mates={timelineMates}
        group={chat.kind === "group"}
        onAnswer={(messageId, state) => dispatch({ type: "answer", chatId: chat.id, messageId, state })}
      />
      <ChatComposer
        ref={composerRef}
        draft={flow.drafts[chat.id] ?? ""}
        placeholder={chat.kind === "group" ? `Message ${chat.title}` : `Message ${lead.name}`}
        busy={Boolean(reply)}
        onDraft={(text) => dispatch({ type: "draft", chatId: chat.id, text })}
        onSend={() => dispatch({ type: "send", chatId: chat.id, mateId: chat.leadId, reply: cannedReply(REPLIES, chat.leadId, flow.sent) })}
        onStop={() => dispatch({ type: "stop", chatId: chat.id })}
      />
    </div>
  );
}
