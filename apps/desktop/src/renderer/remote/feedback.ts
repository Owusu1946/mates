import { useAuth } from "@clerk/electron/react";
import { useSyncExternalStore } from "react";
import { apiFetch, ensureOk } from "../lib/api.ts";

/** Why a reply missed, as the phone asks it (apps/mobile/src/chat/feedback-sheet.tsx; apps/api/src/message-feedback.ts). */
export const FEEDBACK_REASONS = [
  { value: "wrong_answer", label: "Wrong answer" },
  { value: "didnt_follow_instructions", label: "Didn't do what I asked" },
  { value: "too_slow", label: "Too slow" },
  { value: "too_long", label: "Too long" },
  { value: "other", label: "Other" },
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number]["value"];
export type Rating = "up" | "down";

/** Your thumbs on replies this session, shown at once and kept if the API takes them. */
let ratings: Record<string, Rating> = {};
const listeners = new Set<() => void>();
function set(messageId: string, rating: Rating | null) {
  const { [messageId]: _, ...rest } = ratings;
  ratings = rating ? { ...rest, [messageId]: rating } : rest;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Rating replies (POST and DELETE /v1/messages/:id/feedback). The same thumb again takes the
 * rating back; thumbs down comes with why. Resolves with an error message, or null once saved.
 */
export function useFeedback() {
  const { getToken } = useAuth();
  const current = useSyncExternalStore(subscribe, () => ratings);

  async function rate(messageId: string, rating: Rating, reason?: FeedbackReason): Promise<string | null> {
    const before = ratings[messageId] ?? null;
    const removing = before === rating && !reason;
    set(messageId, removing ? null : rating);
    try {
      const path = `/v1/messages/${encodeURIComponent(messageId)}/feedback`;
      const init: RequestInit = removing ? { method: "DELETE" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rating === "down" ? { rating, reason: reason ?? "other" } : { rating }) };
      await ensureOk(await apiFetch(() => getToken(), path, init), "Couldn’t save that. Try again.");
      return null;
    } catch (error) {
      set(messageId, before);
      return error instanceof Error ? error.message : "Couldn’t save that. Try again.";
    }
  }

  return { ratings: current, rate };
}
