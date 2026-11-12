import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import type { DeckMeta, Slide, Source, ThemeInput } from "@muse-clone/decks";
import { useQuery } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { runRequest } from "../chat/background-chat";
import { resolveApiUrl } from "../chat/chat-model";

export type DeckStatus = NonNullable<WorkflowCard["deck"]>["status"];
export type DeckView = {
  id: string;
  title: string;
  theme: ThemeInput;
  meta: DeckMeta;
  slides: Slide[];
  sources: Source[];
  version: number;
  status: DeckStatus;
  built: number;
  total: number;
  error: string | null;
};

/** Still being made or changed: the card and viewer poll until it settles. */
export const deckBusy = (status: DeckStatus | undefined) => status === "queued" || status === "outlining" || status === "writing" || status === "editing";

export const deckKey = (userId: string | null | undefined, deckId: string) => ["deck", userId, deckId] as const;

/** A deck kept live while it builds or changes; settled decks are read once. */
export function useDeck(deckId: string | undefined) {
  const { getToken, userId } = useAuth();
  return useQuery({
    queryKey: deckKey(userId, deckId ?? ""),
    enabled: !!deckId,
    queryFn: async () => (await runRequest<{ deck: DeckView; card: WorkflowCard }>(getToken, `decks/${deckId}`)).deck,
    refetchInterval: (query) => (deckBusy(query.state.data?.status) ? 1_500 : false),
  });
}

/** Downloads the deck as PowerPoint and opens the share sheet (AirDrop, Mail, Files, PowerPoint…). */
export async function shareDeck(getToken: () => Promise<string | null>, deck: Pick<DeckView, "id" | "title" | "version">) {
  const base = resolveApiUrl();
  const token = await getToken();
  if (!base || !token) throw new Error("Sign in and reconnect to continue.");
  const name = deck.title.replace(/[^\p{L}\p{N} ._-]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Deck";
  const file = new File(Paths.cache, `${name} v${deck.version}.pptx`);
  await File.downloadFileAsync(`${base}/v1/decks/${deck.id}/export.pptx`, file, { headers: { authorization: `Bearer ${token}` }, idempotent: true });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn’t available on this device.");
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    UTI: "org.openxmlformats.presentationml.presentation",
    dialogTitle: deck.title,
  });
}
