import type { SentFile } from "./attachments.logic.ts";
import type { Card, Message, MessageTag, Quote } from "../data/sampleCrew.ts";

/**
 * The conversation, without an API: drafts per chat, sending, the mate thinking and then
 * streaming a canned reply word by word, stopping, and answering approval cards; and what you can
 * do to a message: reply to it in a group, pin it, rate it, ask again, edit yours or send it again.
 * Timers live in the hook (useChatFlow); this only decides what each step does.
 */

/** `target`: asking again for a reply that's already there, which streams in its place. */
export type Reply = { chatId: string; mateId: string; phase: "thinking" | "streaming"; full: string; shown: number; target?: string };

export type ChatFlow = {
  messages: Record<string, Message[]>;
  drafts: Record<string, string>;
  unread: Record<string, boolean>;
  /** At most one reply at a time per chat. */
  replies: Record<string, Reply>;
  /** The message you're replying to in each chat, until you send or let it go. */
  replying: Record<string, Quote>;
  sent: number;
};

export type ChatAction =
  | { type: "draft"; chatId: string; text: string }
  | { type: "send"; chatId: string; mateId: string; reply: string; files?: SentFile[]; tags?: MessageTag[] }
  | { type: "stream"; chatId: string }
  | { type: "tick"; chatId: string; words: number }
  | { type: "stop"; chatId: string }
  | { type: "open"; chatId: string }
  | { type: "answer"; chatId: string; messageId: string; state: "allowed" | "skipped" }
  /** A card's new state: a plan that ran, a routine paused, an app connected. */
  | { type: "card"; chatId: string; messageId: string; card: Card }
  /** Messages from elsewhere, like a conversation carried over from the summon bar. */
  | { type: "append"; chatId: string; messages: Message[] }
  | { type: "reply"; chatId: string; quote: Quote | null }
  | { type: "pin"; chatId: string; messageId: string }
  | { type: "rate"; chatId: string; messageId: string; rating: "up" | "down" }
  | { type: "version"; chatId: string; messageId: string; index: number }
  | { type: "regenerate"; chatId: string; messageId: string; reply: string }
  | { type: "edit"; chatId: string; messageId: string; text: string; mateId: string; reply: string }
  | { type: "retry"; chatId: string; messageId: string; mateId: string; reply: string };

export function initialFlow(messages: Record<string, Message[]>, unread: Record<string, boolean>): ChatFlow {
  return { messages, drafts: {}, unread, replies: {}, replying: {}, sent: 0 };
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

const startReply = (state: ChatFlow, chatId: string, mateId: string, full: string, target?: string): ChatFlow => ({
  ...state,
  replies: { ...state.replies, [chatId]: { chatId, mateId, phase: "thinking", full, shown: 0, ...(target ? { target } : {}) } },
});

/** Changes one message in a chat. */
const update = (state: ChatFlow, chatId: string, messageId: string, change: (message: Message) => Message): ChatFlow => ({
  ...state,
  messages: { ...state.messages, [chatId]: (state.messages[chatId] ?? []).map((message) => (message.id === messageId ? change(message) : message)) },
});

function settle(state: ChatFlow, chatId: string): ChatFlow {
  const reply = state.replies[chatId];
  if (!reply) return state;
  const { [chatId]: _, ...replies } = state.replies;
  const text = reply.phase === "streaming" ? shownText(reply) : "";
  if (!text.trim()) return { ...state, replies };
  // Asked again: the new answer joins the message's versions and shows; the rating was for the old one.
  if (reply.target) {
    return update({ ...state, replies }, chatId, reply.target, (message) => {
      const versions = [...(message.versions ?? [message.text]), text];
      return { ...message, text, versions, version: versions.length - 1, rating: undefined };
    });
  }
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
      const replyTo = state.replying[action.chatId];
      const tags = action.tags?.length ? action.tags : undefined;
      const message: Message = { id: `u${state.sent}`, author: "me", text, files, ...(replyTo ? { replyTo } : {}), ...(tags ? { tags } : {}) };
      const { [action.chatId]: _, ...replying } = state.replying;
      return startReply(
        {
          ...state,
          sent: state.sent + 1,
          replying,
          drafts: { ...state.drafts, [action.chatId]: "" },
          messages: { ...state.messages, [action.chatId]: [...(state.messages[action.chatId] ?? []), message] },
        },
        action.chatId,
        action.mateId,
        action.reply,
      );
    }
    case "reply": {
      const { [action.chatId]: _, ...rest } = state.replying;
      return { ...state, replying: action.quote ? { ...rest, [action.chatId]: action.quote } : rest };
    }
    case "pin":
      return update(state, action.chatId, action.messageId, (message) => ({ ...message, pinned: !message.pinned }));
    case "rate":
      // The same thumb again takes it back.
      return update(state, action.chatId, action.messageId, (message) => ({ ...message, rating: message.rating === action.rating ? undefined : action.rating }));
    case "version": {
      const text = state.messages[action.chatId]?.find((message) => message.id === action.messageId)?.versions?.[action.index];
      return text === undefined ? state : update(state, action.chatId, action.messageId, (message) => ({ ...message, text, version: action.index }));
    }
    case "regenerate": {
      const message = state.messages[action.chatId]?.find((candidate) => candidate.id === action.messageId);
      if (!message || message.author === "me" || state.replies[action.chatId]) return state;
      return { ...startReply(state, action.chatId, message.author, action.reply, message.id), sent: state.sent + 1 };
    }
    case "edit": {
      // Changing what you said takes the conversation back to there, and the mate answers again.
      const messages = state.messages[action.chatId] ?? [];
      const at = messages.findIndex((message) => message.id === action.messageId);
      const text = action.text.trim();
      if (at < 0 || messages[at]!.author !== "me" || !text || state.replies[action.chatId]) return state;
      const kept = [...messages.slice(0, at), { ...messages[at]!, text, edited: true, failed: undefined }];
      return { ...startReply({ ...state, messages: { ...state.messages, [action.chatId]: kept } }, action.chatId, action.mateId, action.reply), sent: state.sent + 1 };
    }
    case "retry": {
      const message = state.messages[action.chatId]?.find((candidate) => candidate.id === action.messageId);
      if (!message?.failed || state.replies[action.chatId]) return state;
      const resent = update(state, action.chatId, action.messageId, (failed) => ({ ...failed, failed: undefined }));
      return { ...startReply(resent, action.chatId, action.mateId, action.reply), sent: state.sent + 1 };
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
    case "card":
      return { ...state, messages: { ...state.messages, [action.chatId]: (state.messages[action.chatId] ?? []).map((message) => (message.id === action.messageId ? { ...message, card: action.card } : message)) } };
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
