import { useAuth } from "../auth/account.ts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { sceneOf } from "@muse-clone/decks";
import { useState } from "react";
import type { DeckStatus } from "../data/sampleCrew.ts";
import { apiFetch, ensureOk, read } from "../lib/api.ts";

/**
 * A deck kept live while it's made, the phone's way (apps/mobile/src/decks/use-deck.ts): the
 * reply's card is written once when the deck starts, so the deck itself is asked for
 * (GET /v1/decks/:id) every 1.5 seconds until it settles, then read once and kept for 30 seconds.
 */

/** The deck as its card shows it (the response's `card.deck`: slide titles whatever their layout). */
export type DeckView = { deckId: string; title: string; status: DeckStatus; built: number; total: number; slides: { id: string; title: string }[]; error?: string };
/** The whole deck (theme, slides, sources), for drawing its slides (@muse-clone/decks sceneOf). */
export type DeckContent = Parameters<typeof sceneOf>[0];
type DeckBody = { deck: DeckContent; card: { deck?: DeckView } };
const deckOf = (body: DeckBody): DeckView & { content: DeckContent } => {
  if (!body.card.deck) throw new Error("Couldn’t load the deck.");
  return { ...body.card.deck, content: body.deck };
};

/** Still being made or changed: keep asking. */
export const deckBusy = (status: DeckStatus | undefined) => status === "queued" || status === "outlining" || status === "writing" || status === "editing";

export function useDeck(deckId: string) {
  const { userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["deck", userId, deckId],
    queryFn: async ({ signal }) => deckOf(await read<DeckBody>(await apiFetch(() => getToken(), `/v1/decks/${encodeURIComponent(deckId)}`, { signal }), "Couldn’t load the deck.")),
    enabled: Boolean(userId && deckId),
    refetchInterval: (query) => (deckBusy(query.state.data?.status) ? 1_500 : false),
    staleTime: (query) => (deckBusy(query.state.data?.status) ? 0 : 30_000),
  });
}

/** Stop a deck being made (POST /v1/decks/:id/cancel), and save a finished one as PowerPoint. */
export function useDeckControls(deckId: string) {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const [busy, setBusy] = useState<"stop" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "stop" | "save", work: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy(null);
    }
  }

  const stop = () =>
    run("stop", async () => {
      const body = await read<DeckBody>(await apiFetch(() => getToken(), `/v1/decks/${encodeURIComponent(deckId)}/cancel`, { method: "POST" }), "Couldn’t stop the deck.");
      client.setQueryData(["deck", userId, deckId], deckOf(body));
    }, "Couldn’t stop the deck.");

  /** Downloads the .pptx and hands it to the browser's save, named for the deck. */
  const save = (title: string) =>
    run("save", async () => {
      const response = await ensureOk(await apiFetch(() => getToken(), `/v1/decks/${encodeURIComponent(deckId)}/export.pptx`), "Couldn’t make the PowerPoint.");
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: `${title.replace(/[\/:*?"<>|]+/g, " ").trim() || "Deck"}.pptx` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }, "Couldn’t make the PowerPoint.");

  return { stop, save, busy, error };
}
