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
