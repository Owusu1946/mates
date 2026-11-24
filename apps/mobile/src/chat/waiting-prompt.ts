type MessagePart = { type: string; result?: unknown };
type ChatMessage = { role: string; index: number; content: readonly MessagePart[] };

export type WaitingPrompt = { messageIndex: number; label: string };

/** Finds an unresolved action on the latest assistant reply, never an old card in chat history. */
export function findWaitingPrompt(messages: readonly ChatMessage[], isRunning: boolean): WaitingPrompt | null {
  if (isRunning || messages.at(-1)?.role !== "assistant") return null;
  const message = messages.at(-1)!;
  for (const part of [...message.content].reverse()) {
    if (part.type !== "tool-call" || !part.result || typeof part.result !== "object") continue;
    const card = part.result as {
      kind?: string;
      phase?: string;
      name?: string;
      approval?: { choice?: string };
      computer?: { status?: string; waitingFor?: string };
      browserStatus?: string;
    };
    if (card.kind === "approval" && card.phase === "waiting" && !card.approval?.choice)
      return { messageIndex: message.index, label: "Approve or decline an action" };
    if (card.kind === "plan" && card.phase === "waiting")
      return { messageIndex: message.index, label: "Review the plan" };
    if (card.kind === "choice" && card.phase === "waiting")
      return { messageIndex: message.index, label: "Choose an app" };
    if (card.kind === "connection" && card.phase === "waiting")
      return { messageIndex: message.index, label: `Connect ${card.name ?? "an app"}` };
    if (card.kind === "github" && card.phase === "waiting")
      return { messageIndex: message.index, label: "Connect GitHub" };
    if (card.kind === "schedule" && card.phase === "waiting")
      return { messageIndex: message.index, label: "Confirm the routine" };
    if (card.kind === "computer" && card.computer?.status === "waiting") {
      const label = card.computer.waitingFor === "login" ? "Sign in to continue"
        : card.computer.waitingFor === "approval" ? "Approve a computer action"
          : card.computer.waitingFor === "question" ? "Answer your mate’s question"
            : "Continue on the computer";
      return { messageIndex: message.index, label };
    }
    if (card.kind === "browser" && card.phase === "waiting") {
      const label = card.browserStatus === "login" ? "Sign in in the browser"
        : card.browserStatus === "approval" ? "Confirm a browser action"
          : card.browserStatus === "verification" ? "Complete website verification"
            : "Continue in the browser";
      return { messageIndex: message.index, label };
    }
  }
  return null;
}
