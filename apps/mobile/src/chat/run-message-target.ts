type ChatMessage = {
  id?: string;
  role: string;
  index: number;
  content?: readonly { type: string; result?: unknown }[];
  metadata?: { custom?: Record<string, unknown> };
};

/** The assistant message created by a durable run, if it is in the currently loaded history. */
export function delegationMessageIndex(messages: readonly ChatMessage[], delegationId: string | undefined): number | null {
  if (!delegationId) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role === "assistant" && message.metadata?.custom?.delegationId === delegationId) return i;
  }
  return null;
}

/** A result card can be in a dedicated message or inside the run that created a deck. */
export function notificationMessageIndex(messages: readonly ChatMessage[], target: { messageId?: string; deckId?: string; computerGoalId?: string }): number | null {
  if (!target.messageId && !target.deckId && !target.computerGoalId) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role !== "assistant") continue;
    if (target.messageId && message.id === target.messageId) return i;
    if ((target.deckId || target.computerGoalId) && message.content?.some((part) => {
      if (part.type !== "tool-call" || !part.result || typeof part.result !== "object") return false;
      const result = part.result as { kind?: string; deck?: { deckId?: string }; computer?: { goalId?: string } };
      return target.deckId && result.kind === "deck" && result.deck?.deckId === target.deckId
        || target.computerGoalId && result.kind === "computer" && result.computer?.goalId === target.computerGoalId;
    })) return i;
  }
  return null;
}
