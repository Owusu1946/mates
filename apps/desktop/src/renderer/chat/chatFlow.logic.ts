import type { SentFile } from "./attachments.logic.ts";
import type { Card, Message } from "../data/sampleCrew.ts";

/**
 * The conversation, without an API: drafts per chat, sending, the mate thinking and then
 * streaming a canned reply word by word, stopping, and answering approval cards. Timers live in
 * the hook (useChatFlow); this only decides what each step does.
 */

export type Reply = { chatId: string; mateId: string; phase: "thinking" | "streaming"; full: string; shown: number };

export type ChatFlow = {
  messages: Record<string, Message[]>;
  drafts: Record<string, string>;
  unread: Record<string, boolean>;
  /** At most one reply at a time per chat. */
  replies: Record<string, Reply>;
  sent: number;
};

export type ChatAction =
  | { type: "draft"; chatId: string; text: string }
  | { type: "send"; chatId: string; mateId: string; reply: string; files?: SentFile[] }
  | { type: "stream"; chatId: string }
  | { type: "tick"; chatId: string; words: number }
  | { type: "stop"; chatId: string }
  | { type: "open"; chatId: string }
  | { type: "answer"; chatId: string; messageId: string; state: "allowed" | "skipped" }
  /** Messages from elsewhere, like a conversation carried over from the summon bar. */
  | { type: "append"; chatId: string; messages: Message[] };

export function initialFlow(messages: Record<string, Message[]>, unread: Record<string, boolean>): ChatFlow {
  return { messages, drafts: {}, unread, replies: {}, sent: 0 };
}

const wordsOf = (text: string) => text.split(/(\s+)/).filter(Boolean);

/** The reply's text so far: the first `shown` words, keeping their spacing. */
export function shownText(reply: Reply): string {
  // Words and the spaces between them alternate, so n words end before the nth space.
  return wordsOf(reply.full)
    .slice(0, Math.max(0, reply.shown * 2 - 1))
    .join("");
}

export const isReplyDone = (reply: Reply) => reply.shown * 2 - 1 >= wordsOf(reply.full).length;

function settle(state: ChatFlow, chatId: string): ChatFlow {
  const reply = state.replies[chatId];
  if (!reply) return state;
  const { [chatId]: _, ...replies } = state.replies;
  const text = reply.phase === "streaming" ? shownText(reply) : "";
  if (!text.trim()) return { ...state, replies };
  const message: Message = { id: `r${state.sent}-${chatId}`, author: reply.mateId, text };
  return { ...state, replies, messages: { ...state.messages, [chatId]: [...(state.messages[chatId] ?? []), message] } };
}

export function chatFlowReducer(state: ChatFlow, action: ChatAction): ChatFlow {
  switch (action.type) {
    case "draft":
      return { ...state, drafts: { ...state.drafts, [action.chatId]: action.text } };
    case "send": {
      const text = (state.drafts[action.chatId] ?? "").trim();
      const files = action.files?.length ? action.files : undefined;
      if ((!text && !files) || state.replies[action.chatId]) return state;
      const message: Message = { id: `u${state.sent}`, author: "me", text, files };
      return {
        ...state,
        sent: state.sent + 1,
        drafts: { ...state.drafts, [action.chatId]: "" },
        messages: { ...state.messages, [action.chatId]: [...(state.messages[action.chatId] ?? []), message] },
        replies: { ...state.replies, [action.chatId]: { chatId: action.chatId, mateId: action.mateId, phase: "thinking", full: action.reply, shown: 0 } },
      };
    }
    case "stream": {
      const reply = state.replies[action.chatId];
      if (!reply || reply.phase !== "thinking") return state;
      return { ...state, replies: { ...state.replies, [action.chatId]: { ...reply, phase: "streaming" } } };
    }
    case "tick": {
      const reply = state.replies[action.chatId];
      if (!reply || reply.phase !== "streaming") return state;
      const next = { ...reply, shown: reply.shown + action.words };
      // Finished: the reply becomes an ordinary message.
      return isReplyDone(next) ? settle({ ...state, replies: { ...state.replies, [action.chatId]: next } }, action.chatId) : { ...state, replies: { ...state.replies, [action.chatId]: next } };
    }
    case "stop":
      // What was said so far stays; a reply that hadn't started is dropped.
      return settle(state, action.chatId);
    case "open":
      return state.unread[action.chatId] ? { ...state, unread: { ...state.unread, [action.chatId]: false } } : state;
    case "append":
      return action.messages.length ? { ...state, messages: { ...state.messages, [action.chatId]: [...(state.messages[action.chatId] ?? []), ...action.messages] } } : state;
    case "answer": {
      const messages = (state.messages[action.chatId] ?? []).map((message) =>
        message.id === action.messageId && message.card?.type === "approval" ? { ...message, card: { ...message.card, state: action.state } as Card } : message,
      );
      return { ...state, messages: { ...state.messages, [action.chatId]: messages } };
    }
  }
}

/** What a mate is doing because of a reply in progress, which outranks its sample status. */
export function replyStatus(replies: Record<string, Reply>, mateId: string): "thinking" | "working" | null {
  const reply = Object.values(replies).find((candidate) => candidate.mateId === mateId);
  if (!reply) return null;
  return reply.phase === "thinking" ? "thinking" : "working";
}

/** The next canned reply for a mate: they take turns through their list. */
export function cannedReply(replies: Record<string, string[]>, mateId: string, sent: number): string {
  const list = replies[mateId] ?? ["Got it."];
  return list[sent % list.length]!;
}
