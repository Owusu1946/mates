import { useAuth } from "@clerk/electron/react";
import { useSyncExternalStore } from "react";
import { allConnected, choiceFor, type CardAction, type CardStatus } from "../chat/cards/cardAnswers.logic.ts";
import { connectApp } from "./cardControls.ts";
import { useChatActions } from "./send.ts";

/**
 * Answering the cards in a mate's reply, the phone's way. Most answers carry the reply on: the run
 * waiting for them resumes in that same reply with the answer as its `choice` (send.ts resume). A
 * card says "Doing it now…" until the reply moves it on; nothing is decided on this device, so the
 * card changes when the reply does (rules: cardAnswers.logic.ts).
 *
 * Connecting an app happens in your browser first (cardControls.ts connectApp); the reply carries
 * on once every app it asked for is connected.
 */

/** Each card's answer, by `rowId:index`. */
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

export const cardKey = (rowId: string, index: number) => `${rowId}:${index}`;

/** Connections in progress, by card, so Cancel can stop waiting. */
const connecting = new Map<string, AbortController>();
/** Apps connected so far for each waiting run. */
const connectedByRun = new Map<string, Set<string>>();

export type CardTarget = {
  /** The row it's in, and the stored reply that row shows (a group reply's turns are rows of one reply). */
  rowId: string;
  replyId: string;
  index: number;
  resumeRunId: string | undefined;
  /** For a connection: this card's app, and every app its run asked for. */
  app?: string;
  apps?: string[];
};

export function useCardActions(chatId: string) {
  const chat = useChatActions(chatId);
  const { getToken } = useAuth();
  const current = useSyncExternalStore(subscribe, () => statuses);

  async function resume(target: CardTarget, key: string, choice: string | undefined, pending: string) {
    if (!target.resumeRunId) return;
    setCardStatus(key, { pending });
    const failed = await chat.resume(target.replyId, target.resumeRunId, choice);
    // Started: "pending" stays until the reply moves the card on; it couldn't: say why, to try again.
    if (failed) setCardStatus(key, { error: failed });
  }

  async function connect(target: CardTarget, key: string) {
    if (!target.app || !target.resumeRunId) return;
    const controller = new AbortController();
    connecting.set(key, controller);
    setCardStatus(key, { pending: "Finish signing in, in your browser…" });
    const outcome = await connectApp(() => getToken(), target.app, controller.signal);
    if (connecting.get(key) === controller) connecting.delete(key);
    if (outcome === "cancelled") return setCardStatus(key, null);
    if (outcome !== "connected") return setCardStatus(key, { error: outcome });
    const done = connectedByRun.get(target.resumeRunId) ?? new Set<string>();
    done.add(target.app);
    connectedByRun.set(target.resumeRunId, done);
    if (!allConnected(done, target.apps ?? [target.app])) return setCardStatus(key, { pending: "Connected. Waiting on the other apps…" });
    connectedByRun.delete(target.resumeRunId);
    await resume(target, key, undefined, "Connected. Carrying on…");
  }

  /** Answers a card. One answer at a time per card. */
  async function answer(target: CardTarget, action: CardAction) {
    const key = cardKey(target.rowId, target.index);
    if (action.type === "cancelConnect") {
      connecting.get(key)?.abort();
      return;
    }
    const status = statuses[key];
    if (status && "pending" in status) return;
    if (action.type === "connect") return connect(target, key);
    const { choice, pending } = choiceFor(action);
    await resume(target, key, choice, pending);
  }

  return { statuses: current, answer };
}
