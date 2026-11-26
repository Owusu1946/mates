import { useEffect, useReducer } from "react";
import { chatFlowReducer, type ChatFlow } from "./chatFlow.logic.ts";

/** How long a mate "thinks" before it starts to answer, and how fast its words arrive. */
const THINKING_MS = 600;
const WORD_MS = 90;

/**
 * A conversation's local state and the timers that drive its sample replies (rules:
 * chatFlow.logic): the summon bar's, and the drafts and notes of the main window, whose chats are
 * real (remote/thread.ts).
 */
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
