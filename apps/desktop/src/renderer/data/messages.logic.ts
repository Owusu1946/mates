import { branchTo, siblingsOf, textOf, type StoredItem, type StoredMessage } from "@muse-clone/client-core";
import type { Message } from "./sampleCrew.ts";

/**
 * A chat's stored messages as the timeline's rows. Pure, so the rules are tested without React.
 *
 * - The chat reads along one branch, down to `headId`; a regenerated reply shows its versions.
 * - Your messages are "me". A mate's reply is its chat's mate, or in a group, whoever its speaker
 *   card names (apps/api/src/groups.ts): one stored reply can hold several mates' turns, each its
 *   own row.
 * - A day divider sits above the first message of each day.
 * - Cards wait for their own change; a live reply's running step shows as what the mate is doing.
 */

type Card = { kind?: string; phase?: string; label?: string; speaker?: { id?: string } };

const cardOf = (part: StoredMessage["content"][number]): Card | null => (part.type === "tool-call" ? (((part as { result?: unknown }).result ?? null) as Card | null) : null);

/** "Today", "Yesterday", the weekday this week, else the date. */
export function dayLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 60 * 60_000;
  if (at.getTime() >= startOfToday) return "Today";
  if (at.getTime() >= startOfToday - day) return "Yesterday";
  if (at.getTime() >= startOfToday - 6 * day) return at.toLocaleDateString(undefined, { weekday: "long" });
  return at.toLocaleDateString(undefined, { day: "numeric", month: "long", ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

/** A reply split by speaker: each mate's turn, in order, with the text that follows its card. */
function turnsOf(message: StoredMessage, defaultAuthor: string): { author: string; text: string }[] {
  const turns: { author: string; text: string }[] = [];
  let current = { author: defaultAuthor, text: "" };
  let spoke = false;
  for (const part of message.content) {
    const card = cardOf(part);
    if (card?.kind === "speaker" && card.speaker?.id) {
      if (spoke || current.text) turns.push(current);
      current = { author: card.speaker.id, text: "" };
      spoke = true;
    } else if (part.type === "text") current.text += String((part as { text?: unknown }).text ?? "");
  }
  turns.push(current);
  return turns.filter((turn, index) => turn.text.trim() || index === turns.length - 1);
}

/** The running step of a live reply: what the mate is doing right now. */
const runningStep = (message: StoredMessage) =>
  message.content
    .map(cardOf)
    .filter((card): card is Card => !!card && card.kind !== "speaker" && card.phase === "running" && typeof card.label === "string")
    .at(-1)?.label;

export type RowOptions = {
  /** Who answers when a reply names no speaker: the chat's mate, or a group's lead. */
  defaultAuthor: string;
  /** Stored replies the server is still writing. */
  live: ReadonlySet<string>;
  now: Date;
};

export function toRows(items: StoredItem[], headId: string | null, options: RowOptions): Message[] {
  const rows: Message[] = [];
  let lastDay = "";
  for (const { message } of branchTo(items, headId)) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const day = dayLabel(message.createdAt, options.now);
    const firstOfDay = day !== lastDay;
    const live = options.live.has(message.id);
    if (message.role === "user") {
      rows.push({ id: message.id, sourceId: message.id, author: "me", text: textOf(message), ...(firstOfDay ? { day } : {}) });
      lastDay = day;
      continue;
    }
    const siblings = siblingsOf(items, message.id);
    const versions = siblings.length > 1 ? siblings.map((id) => textOf(items.find((item) => item.message.id === id)!.message)) : undefined;
    const turns = turnsOf(message, options.defaultAuthor);
    const step = live ? runningStep(message) : undefined;
    turns.forEach((turn, index) => {
      const last = index === turns.length - 1;
      // A finished reply that's only cards shows nothing yet (cards come in their own change).
      if (!turn.text.trim() && !(last && live)) return;
      rows.push({
        id: index ? `${message.id}:${index}` : message.id,
        sourceId: message.id,
        author: turn.author,
        text: turn.text,
        ...(firstOfDay && !rows.some((row) => row.sourceId === message.id) ? { day } : {}),
        ...(last && live ? { live: true, ...(step ? { step } : {}) } : {}),
        ...(last && versions ? { versions, version: siblings.indexOf(message.id), versionIds: siblings } : {}),
      });
      lastDay = day;
    });
  }
  return rows;
}
