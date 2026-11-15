/**
 * What a reply looks like once the person stopped it: whatever arrived stays, any card still
 * spinning reads "Stopped", and the message is marked cancelled so the app says "Request was
 * cancelled" (now, and when the chat is reopened).
 */
type Part = Record<string, unknown>;

export const CANCELLED_STATUS = { type: "incomplete", reason: "cancelled" } as const;

export function stoppedContent(content: Part[]): Part[] {
  return content.map((part) => {
    const result = part.result as { phase?: unknown } | undefined;
    if (part.type !== "tool-call" || !result || typeof result !== "object" || result.phase !== "running") return part;
    return { ...part, result: { ...result, phase: "error", label: "Stopped", detail: undefined } };
  });
}

export function cancelledMessage<T extends Record<string, unknown>>(message: T): T & { status: typeof CANCELLED_STATUS } {
  const content = Array.isArray(message.content) ? stoppedContent(message.content as Part[]) : message.content;
  return { ...message, content, status: CANCELLED_STATUS };
}
