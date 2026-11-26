import { keepUnchanged } from "../data/messages.logic.ts";
import type { Message } from "../data/sampleCrew.ts";

/** Each chat's rows as last shown, so the next render can keep the ones that didn't change. */
const shown = new Map<string, Message[]>();

/**
 * A chat's rows with unchanged ones kept as the same objects (keepUnchanged): the timeline's rows
 * are memoised on them, so a streamed word draws one row, not the chat.
 */
export function stableRows(chatId: string, rows: Message[]): Message[] {
  const kept = keepUnchanged(shown.get(chatId) ?? [], rows);
  shown.set(chatId, kept);
  return kept;
}
