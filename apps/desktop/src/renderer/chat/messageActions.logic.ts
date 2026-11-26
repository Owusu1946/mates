import type { Message, Quote } from "../data/sampleCrew.ts";

/**
 * The rules behind a message's actions: what a quote keeps, which reply can be asked again, who
 * answers when you reply to someone in a group, and what's pinned.
 */

const QUOTE_CHARS = 140;

/** A message as a one-line quote, kept short. */
export function quoteOf(message: Pick<Message, "id" | "author" | "text">): Quote {
  const line = message.text.replace(/\s+/g, " ").trim();
  return { id: message.id, author: message.author, text: line.length > QUOTE_CHARS ? `${line.slice(0, QUOTE_CHARS - 1).trimEnd()}…` : line };
}

/**
 * The mate reply that can be asked again: the last message, when a mate wrote it in words. A card
 * (an approval, a run) is an action, not an answer to reword.
 */
export function regenerableId(messages: Message[]): string | null {
  const last = messages.at(-1);
  return last && last.author !== "me" && last.text.trim() && !last.card ? last.id : null;
}

/** Who answers: the mate you replied to, when they're in the chat; otherwise the lead. */
export function answererFor(quote: Quote | undefined, mateIds: string[], leadId: string): string {
  return quote && quote.author !== "me" && mateIds.includes(quote.author) ? quote.author : leadId;
}

export const pinnedOf = (messages: Message[]) => messages.filter((message) => message.pinned);
