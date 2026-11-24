import { useEffect, useReducer } from "react";
import type { Crew } from "../data/sampleCrew.ts";
import { chatFlowReducer, initialFlow, type ChatFlow } from "./chatFlow.logic.ts";

/** How long a mate "thinks" before it starts to answer, and how fast its words arrive. */
const THINKING_MS = 600;
const WORD_MS = 90;

/** The conversation for the whole crew, with the timers that drive replies (rules: chatFlow.logic). */
export function useChatFlow(crew: Crew) {
  return useChatFlowFrom(() => initialFlow(crew.messages, Object.fromEntries(crew.chats.map((chat) => [chat.id, Boolean(chat.unread)]))));
}

/** Conversations from any starting point, like the summon bar's single one, with the same timers. */
export function useChatFlowFrom(init: () => ChatFlow) {
  const [flow, dispatch] = useReducer(chatFlowReducer, undefined, init);

  // Each step schedules the next: thinking → streaming → one word at a time → a message.
  useEffect(() => {
    const timers = Object.values(flow.replies).map((reply) =>
      reply.phase === "thinking"
        ? setTimeout(() => dispatch({ type: "stream", chatId: reply.chatId }), THINKING_MS)
        : setTimeout(() => dispatch({ type: "tick", chatId: reply.chatId, words: 1 }), WORD_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [flow.replies]);

  return [flow, dispatch] as const;
}
