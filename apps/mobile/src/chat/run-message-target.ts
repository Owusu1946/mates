type ChatMessage = {
  role: string;
  index: number;
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
