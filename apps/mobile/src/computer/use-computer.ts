import { useAuth } from "@clerk/expo";
import type { ComputerView } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { runRequest } from "../chat/background-chat";
import { useMates } from "../mates/data";

export type ComputerStatus = { available: false } | ({ available: true } & ComputerView);
export type ComputerKey = "Enter" | "Tab" | "Backspace" | "Escape" | "Up" | "Down" | "Left" | "Right";

/** Amber, the mates' own warm colour, for "it needs you". */
export const NEEDS_YOU = "#d27e41";

/**
 * How many mounted screens show the live view right now. Only those count as watching: a poll from
 * the chat header alone must not keep an idle desktop on.
 */
let watchers = 0;

/**
 * The user's computer, shared by every screen that shows it. Polls fast while it's starting, on or a
 * mate is working, and slowly while it's off. Pass `watching` from screens that show the live view.
 */
export function useComputer(options?: { enabled?: boolean; watching?: boolean }) {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const mates = useMates();
  const key = ["computer", userId];
  const watching = !!options?.watching;

  useEffect(() => {
    if (!watching) return;
    watchers++;
    return () => { watchers--; };
  }, [watching]);

  const query = useQuery({
    queryKey: key,
    enabled: options?.enabled !== false && !!userId,
    queryFn: () => runRequest<ComputerStatus>(getToken, watchers > 0 ? "computer?watching=1" : "computer"),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data?.available) return 5 * 60_000;
      if (data.state === "starting" || data.state === "stopping") return 2_000;
      return data.state === "on" || data.goal ? 3_000 : 30_000;
    },
    staleTime: 1_500,
  });
  const data = query.data;
  const view = data?.available ? data : null;
  const driver = view?.goal?.mateId ? mates.data?.mates.find((m) => m.id === view.goal!.mateId) : undefined;

  const act = useCallback(
    async (action: "start" | "takeover" | "handback" | "stop") => {
      const next = await runRequest<ComputerView>(getToken, `computer/${action}`, {});
      client.setQueryData(["computer", userId], { available: true, ...next });
      return next;
    },
    [client, getToken, userId],
  );
  const type = useCallback(
    (input: { text?: string; key?: ComputerKey }) => runRequest(getToken, "computer/input", input),
    [getToken],
  );

  return {
    available: !!data?.available,
    loading: query.isPending,
    view,
    /** The driving mate's name and colour, for the status dot and captions. */
    driver: driver ? { name: driver.name, color: driver.gradient[1] } : null,
    working: view?.goal?.status === "running",
    needsYou: view?.goal?.status === "waiting" && view.goal.waitingFor !== "user_control",
    userHasControl: view?.state === "on" && view.controller === "user",
    refresh: () => client.invalidateQueries({ queryKey: key }),
    act,
    type,
  };
}
