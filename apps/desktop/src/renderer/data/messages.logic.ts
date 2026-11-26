import { branchTo, textOf, type StoredItem, type StoredMessage } from "@muse-clone/client-core";
import type { Message } from "./sampleCrew.ts";
import { cardsOf } from "./workflowCards.logic.ts";

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

type Turn = { author: string; text: string; parts: unknown[] };

/** A reply split by speaker: each mate's turn, in order, with the text and cards that follow its label. */
function turnsOf(message: StoredMessage, defaultAuthor: string): Turn[] {
  const turns: Turn[] = [];
  let current: Turn = { author: defaultAuthor, text: "", parts: [] };
  let spoke = false;
  for (const part of message.content) {
    const card = cardOf(part);
    if (card?.kind === "speaker" && card.speaker?.id) {
      if (spoke || current.text || current.parts.length) turns.push(current);
      current = { author: card.speaker.id, text: "", parts: [] };
      spoke = true;
    } else if (part.type === "text") current.text += String((part as { text?: unknown }).text ?? "");
    else if (card) current.parts.push(part);
  }
  turns.push(current);
  return turns.filter((turn, index) => turn.text.trim() || turn.parts.length || index === turns.length - 1);
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
  // Each message's answers, found once, so a reply's versions cost nothing per message (a chat of
  // hundreds re-reads on every streamed word).
  const answers = new Map<string | null, StoredItem[]>();
  for (const item of items) {
    const list = answers.get(item.parentId);
    if (list) list.push(item);
    else answers.set(item.parentId, [item]);
  }
  for (const { message, parentId } of branchTo(items, headId)) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const day = dayLabel(message.createdAt, options.now);
    const firstOfDay = day !== lastDay;
    const live = options.live.has(message.id);
    if (message.role === "user") {
      rows.push({ id: message.id, sourceId: message.id, author: "me", text: textOf(message), ...(firstOfDay ? { day } : {}) });
      lastDay = day;
      continue;
    }
    const siblings = (answers.get(parentId) ?? []).filter((item) => item.message.role === message.role);
    const versions = siblings.length > 1 ? siblings.map((item) => textOf(item.message)) : undefined;
    const versionIds = siblings.map((item) => item.message.id);
    const turns = turnsOf(message, options.defaultAuthor);
    const step = live ? runningStep(message) : undefined;
    const stopped = message.status?.type === "incomplete" && message.status.reason === "cancelled";
    turns.forEach((turn, index) => {
      const last = index === turns.length - 1;
      const cards = cardsOf(turn.parts, { stopped });
      // Nothing to show yet: no words, no cards, and not being written.
      if (!turn.text.trim() && !cards.length && !(last && live)) return;
      rows.push({
        id: index ? `${message.id}:${index}` : message.id,
        sourceId: message.id,
        author: turn.author,
        text: turn.text,
        ...(cards.length ? { cards } : {}),
        ...(firstOfDay && !rows.some((row) => row.sourceId === message.id) ? { day } : {}),
        ...(last && live ? { live: true, ...(step ? { step } : {}) } : {}),
        ...(last && versions ? { versions, version: versionIds.indexOf(message.id), versionIds } : {}),
      });
      lastDay = day;
    });
  }
  return rows;
}

/** Equal by value: lists item by item, and plain objects (a row's cards) key by key. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (!sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  return true;
}

/** Two rows that say the same: every field equal (lists compared item by item). */
function sameRow(a: Message, b: Message): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Message>;
  for (const key of keys) if (!sameValue(a[key], b[key])) return false;
  return true;
}

/**
 * The new rows, with each one that didn't change replaced by the very row object it was before,
 * and the previous list itself when nothing changed at all. The timeline's rows are memoised on
 * their message object, so while a reply streams only its own row draws again, not the whole chat.
 */
export function keepUnchanged(previous: readonly Message[], next: Message[]): Message[] {
  if (!previous.length) return next;
  const before = new Map(previous.map((row) => [row.id, row]));
  let changed = previous.length !== next.length;
  const rows = next.map((row, index) => {
    const old = before.get(row.id);
    if (old && sameRow(old, row)) {
      if (previous[index] !== old) changed = true;
      return old;
    }
    changed = true;
    return row;
  });
  return changed ? rows : (previous as Message[]);
}
