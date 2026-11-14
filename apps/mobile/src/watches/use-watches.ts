import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { runRequest } from "../chat/background-chat";

export type Watch = NonNullable<WorkflowCard["watch"]>;
export type WatchAction = "pause" | "resume" | "cancel" | "renew";
export type WatchEvent = { kind: string; met: boolean; note: string; evidence: { url: string | null; quote: string }[]; at: string };

/** Every watch the user has, newest first, kept fresh while a card or the Routines screen is open. */
export function useWatches() {
  const { getToken, userId } = useAuth();
  return useQuery({
    queryKey: ["watches", userId],
    queryFn: async () => (await runRequest<{ watches: WorkflowCard[] }>(getToken, "watches")).watches.map((card) => card.watch!).filter(Boolean),
    enabled: !!userId,
    refetchInterval: 60_000,
  });
}

/** Pause, resume, cancel or keep watching; refreshes every view of the watches after. */
export function useWatchControl() {
  const { getToken } = useAuth();
  const client = useQueryClient();
  return async (watch: Pick<Watch, "watchId" | "version">, action: WatchAction) => {
    await runRequest(getToken, `watches/${watch.watchId}/control`, { action, version: watch.version });
    await client.invalidateQueries({ queryKey: ["watches"] });
  };
}

export const STATUS_TEXT: Record<Watch["status"], string> = {
  active: "Watching",
  paused: "Paused",
  fired: "Done",
  expired: "Stopped after 30 days",
  cancelled: "Cancelled",
  failed: "Couldn’t keep watching",
};

/** "Checks every 4 hours" or "Waits for Gmail". */
export const howText = (watch: Pick<Watch, "every" | "app">) => (watch.every ? `Checks ${watch.every}` : `Waits for ${watch.app ? watch.app.charAt(0).toUpperCase() + watch.app.slice(1) : "the app"}`);
