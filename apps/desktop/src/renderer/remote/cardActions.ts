import { useSyncExternalStore } from "react";
import { choiceFor, type CardAction, type CardStatus } from "../chat/cards/cardAnswers.logic.ts";
import { useChatActions } from "./send.ts";

/**
 * Answering the cards in a mate's reply, the phone's way. Most answers carry the reply on: the run
 * waiting for them resumes in that same reply with the answer as its `choice` (send.ts resume). A
 * card says "Doing it now…" until the reply moves it on; nothing is decided on this device, so the
 * card changes when the reply does (rules: cardAnswers.logic.ts).
 */

/** Each card's answer, by `replyId:index`. */
let statuses: Record<string, CardStatus> = {};
const listeners = new Set<() => void>();
export function setCardStatus(key: string, status: CardStatus | null) {
  const { [key]: _, ...rest } = statuses;
  statuses = status ? { ...rest, [key]: status } : rest;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const cardKey = (replyId: string, index: number) => `${replyId}:${index}`;

export function useCardActions(chatId: string) {
  const chat = useChatActions(chatId);
  const current = useSyncExternalStore(subscribe, () => statuses);

  /**
   * Answers a card in the row `rowId` (a group reply's turns are rows of one stored reply,
   * `replyId`): its run carries on in that reply. One answer at a time per card.
   */
  async function answer(rowId: string, replyId: string, index: number, resumeRunId: string | undefined, action: CardAction) {
    const key = cardKey(rowId, index);
    const status = statuses[key];
    if (!resumeRunId || (status && "pending" in status)) return;
    const { choice, pending } = choiceFor(action);
    setCardStatus(key, { pending });
    const failed = await chat.resume(replyId, resumeRunId, choice);
    // Started: "pending" stays until the reply moves the card on; it couldn't: say why, to try again.
    if (failed) setCardStatus(key, { error: failed });
  }

  return { statuses: current, answer };
}
