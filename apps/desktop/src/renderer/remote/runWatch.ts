import { useAuth } from "@clerk/electron/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiFetch, type GetToken } from "../lib/api.ts";
import { followRun, isFollowing } from "./liveRuns.ts";
import { threadKey } from "./thread.ts";

/** How often the open chat checks for replies started elsewhere: often while one is going, rarely otherwise. */
const ACTIVE_MS = 2_000;
const IDLE_MS = 20_000;

type RunRow = { id: string; status: string };
type RunDetail = { id: string; status: string; assistantMessageId: string; parentId: string | null };

const isActive = (run: RunRow) => run.status === "queued" || run.status === "running";

/**
 * Replies started somewhere else, shown live here: a message sent from the phone while this chat
 * is open, a routine, a mission round. While the chat is open (and the window isn't hidden) it
 * checks its runs (GET /v1/runs?chatId=), and any active one this window isn't following is
 * followed on its live stream from the start, the same as a send from here. The phone polls the
 * history for this; following the stream instead shows every word as it's written.
 */
export function useRunWatch(chatId: string) {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const token: GetToken = () => getToken();
    const key = threadKey(userId, chatId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // One check at a time, so a focus during a check doesn't start a second loop.
    let checking = false;

    const check = async () => {
      checking = true;
      let active = false;
      if (document.visibilityState === "visible") {
        try {
          const response = await apiFetch(token, `/v1/runs?chatId=${encodeURIComponent(chatId)}`);
          const runs = response.ok ? (((await response.json()) as { runs?: RunRow[] }).runs ?? []) : [];
          for (const run of runs.filter(isActive)) {
            active = true;
            if (isFollowing(run.id)) continue;
            const detail = await apiFetch(token, `/v1/runs/${encodeURIComponent(run.id)}?after=0`);
            const body = detail.ok ? ((await detail.json()) as { run?: RunDetail }) : null;
            if (stopped || !body?.run?.parentId) continue;
            // The message it answers was sent elsewhere: bring the history in so the question shows above the reply.
            void client.invalidateQueries({ queryKey: key });
            followRun(client, token, { runId: run.id, chatKey: key, replyId: body.run.assistantMessageId, parentId: body.run.parentId });
          }
        } catch {
          // Offline for a moment: the next check tries again.
        }
      }
      checking = false;
      if (!stopped) timer = setTimeout(() => void check(), active ? ACTIVE_MS : IDLE_MS);
    };

    void check();
    // Coming back to the window checks straight away rather than waiting for the next turn.
    const now = () => {
      if (checking) return;
      clearTimeout(timer);
      void check();
    };
    document.addEventListener("visibilitychange", now);
    window.addEventListener("focus", now);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", now);
      window.removeEventListener("focus", now);
    };
  }, [chatId, client, getToken, userId]);
}
