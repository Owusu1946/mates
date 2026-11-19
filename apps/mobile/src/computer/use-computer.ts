import { useAuth } from "@clerk/expo";
import type { ComputerView } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { runRequest } from "../chat/background-chat";
import { useMates } from "../mates/data";

export type ComputerStatus = { available: false } | ({ available: true } & ComputerView);

/** Amber, the mates' own warm colour, for "it needs you". */
export const NEEDS_YOU = "#d27e41";

/**
 * The user's computer, shared by every screen that shows it. Polls fast while it's on or a mate is
 * working (each poll also tells the mate someone is watching), and slowly while it's off.
 */
export function useComputer(options?: { enabled?: boolean }) {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const mates = useMates();
  const key = ["computer", userId];
  const query = useQuery({
    queryKey: key,
    enabled: options?.enabled !== false && !!userId,
    queryFn: () => runRequest<ComputerStatus>(getToken, "computer"),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data?.available) return 5 * 60_000;
      return data.state === "on" || data.state === "starting" || data.goal ? 3_000 : 30_000;
    },
    staleTime: 2_000,
  });
  const data = query.data;
  const view = data?.available ? data : null;
  const driver = view?.goal?.mateId ? mates.data?.mates.find((m) => m.id === view.goal!.mateId) : undefined;

  const act = useCallback(
    async (action: "takeover" | "handback" | "stop") => {
      const next = await runRequest<ComputerView>(getToken, `computer/${action}`, {});
      client.setQueryData(["computer", userId], { available: true, ...next });
      return next;
    },
    [client, getToken, userId],
  );
  const type = useCallback(
    (input: { text?: string; key?: "Enter" | "Tab" | "Backspace" | "Escape" }) => runRequest(getToken, "computer/input", input),
    [getToken],
  );

  return {
    available: !!data?.available,
    view,
    /** The driving mate's name and colour, for the status dot and captions. */
    driver: driver ? { name: driver.name, color: driver.gradient[1] } : null,
    working: view?.goal?.status === "running",
    needsYou: view?.goal?.status === "waiting" && view.goal.waitingFor !== "user_control",
    userHasControl: view?.controller === "user",
    refresh: () => client.invalidateQueries({ queryKey: key }),
    act,
    type,
  };
}
