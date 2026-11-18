export type PromptMessage = { role: string; content: unknown; [key: string]: unknown };

/** Stable system prefix first, conversation next, request-specific context last. */
export function buildPromptMessages(input: {
  stableInstructions: string;
  stableUserContext?: string;
  turns: PromptMessage[];
  volatileContext: string[];
}) {
  return [
    { role: "system" as const, content: input.stableInstructions },
    ...(input.stableUserContext ? [{ role: "system" as const, content: input.stableUserContext }] : []),
    ...input.turns,
    ...input.volatileContext.filter(Boolean).map((content) => ({ role: "system" as const, content })),
  ];
}

export function stablePromptPrefix(messages: PromptMessage[]) {
  const firstTurn = messages.findIndex((message) => message.role !== "system");
  return JSON.stringify(messages.slice(0, firstTurn < 0 ? messages.length : firstTurn));
}

export function sortToolsByName<T>(tools: T[]): T[] {
  const name = (tool: T) => {
    if (!tool || typeof tool !== "object" || !("function" in tool)) return "";
    const definition = (tool as { function?: { name?: unknown } }).function;
    return typeof definition?.name === "string" ? definition.name : "";
  };
  return [...tools].sort((a, b) => name(a).localeCompare(name(b), "en"));
}

/**
 * A greeting or a thank-you that needs no tools or lookups. Never "ok", "great" or "cool": those
 * often answer an offer ("Want me to send it?") and must be able to act. Nothing is trivial when
 * the mate's last message asked something, since any reply to a question may be a yes.
 */
export function isTrivialChatMessage(text: string, previousAssistantText = ""): boolean {
  if (/\?\s*\S{0,3}\s*$/.test(previousAssistantText.trim())) return false;
  return /^(?:hi|hello|hey|hiya|good morning|good afternoon|good evening|thanks|thank you|thx)(?:\s+(?:there|so much|a lot))?[!.\s]*$/i.test(text.trim());
}

/** Rides stay offered while a ride conversation is going, so "Osu" can answer Sail's pickup question. */
export function isTravelConversation(turns: { role: string; content: string }[]): boolean {
  return turns.slice(-6).some((turn) => isTravelRequest(turn.content));
}

export function isTravelRequest(text: string): boolean {
  return /\b(?:ride|uber|taxi|cab|trotro|transit|public transport|bus|train|directions?|route|commute|pickup|drop[- ]?off|fare|traffic)\b|\bfrom\s+.{2,50}\s+to\s+.{2,50}/i.test(text);
}
