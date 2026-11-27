import type { Card, CardStatus } from "../../data/sampleCrew.ts";

/**
 * Answering a card, as the API reads the answer (apps/api agent-chat.ts) and as the phone sends it:
 * approve / always / decline for an approval, the option's id for a choice, `approve:<ids>` or
 * decline for a plan.
 */

/** An answer the reply carries on with. */
export type ResumeAction =
  | { type: "approve" }
  | { type: "always" }
  | { type: "decline" }
  | { type: "choose"; optionId: string }
  | { type: "plan"; actionIds: string[] }
  | { type: "planDecline" };

/** What a card asks to do, from its buttons: an answer, or connecting the app it needs (and giving up on that). */
export type CardAction = ResumeAction | { type: "connect" } | { type: "cancelConnect" };

export type { CardStatus };

/** The choice a run is resumed with, and what the card says while it goes. */
export function choiceFor(action: ResumeAction): { choice: string; pending: string } {
  switch (action.type) {
    case "approve":
      return { choice: "approve", pending: "Doing it now…" };
    case "always":
      return { choice: "always", pending: "Doing it now…" };
    case "decline":
      return { choice: "decline", pending: "Leaving it…" };
    case "choose":
      return { choice: action.optionId, pending: "Carrying on…" };
    case "plan":
      return { choice: `approve:${action.actionIds.join(",")}`, pending: "Starting…" };
    case "planDecline":
      return { choice: "decline", pending: "Leaving it…" };
  }
}

/** Connect links come only from the API's sign-in service, as on the phone (app-connection.tsx). */
export const isConnectUrl = (url: unknown): url is string => typeof url === "string" && /^https:\/\/connect\.composio\.(dev|ai)\//.test(url);

/**
 * A reply that needs several apps carries on once the last of them is connected (the phone's
 * connectedByRun): `connected` is what's connected for its run so far.
 */
export const allConnected = (connected: ReadonlySet<string>, needed: readonly string[]) => needed.every((app) => connected.has(app));

/** Whether a card still waits for you: once the reply moves it on, an answer in flight is done. */
export function awaitsAnswer(card: Card): boolean {
  if (card.type === "approval" || card.type === "choice") return card.state === "open";
  if (card.type === "plan") return card.state === "review";
  if (card.type === "connect") return card.state !== "connected";
  return false;
}

/** A card's answer as it shows: in flight only while the card still waits; an error until answered again. */
export function shownStatus(card: Card, status: CardStatus | undefined): CardStatus | undefined {
  if (!status) return undefined;
  return awaitsAnswer(card) ? status : undefined;
}
