import { useAuth } from "@clerk/electron/react";
import { useEffect, useState } from "react";
import { read, useApi } from "../lib/api.ts";

export type LeaderSetup = { status: "loading" | "needed" | "done" };

type MatesBody = { mates: { isDefault: boolean; setupAt: string | null }[] };

const readyKey = (userId: string) => `mates.leader-ready.${userId}`;

function remembered(userId: string | null | undefined) {
  try {
    return !!userId && localStorage.getItem(readyKey(userId)) === "1";
  } catch {
    return false;
  }
}

function remember(userId: string) {
  try {
    localStorage.setItem(readyKey(userId), "1");
  } catch {
    // Only a shortcut for the next launch.
  }
}

/**
 * Whether this account still has to set up its lead mate, as on the phone
 * (apps/mobile/src/onboarding/leader-gate.tsx): a new account's lead mate has no setupAt until the
 * setup screen saves it. However the account was made (email, Apple or Google), this one rule
 * decides. Once known, this device remembers it, so a relaunch opens straight into the app. If the
 * mates can't load, the app opens anyway rather than blocking.
 */
export function useLeaderSetup(): LeaderSetup {
  const { userId } = useAuth();
  const api = useApi();
  const [status, setStatus] = useState<LeaderSetup["status"]>(() => (remembered(userId) ? "done" : "loading"));

  useEffect(() => {
    if (!userId || status !== "loading") return;
    let live = true;
    api.v1.mates
      .$get()
      .then((response) => read<MatesBody>(response, "Couldn't load your mates."))
      .then((body) => {
        const leader = body.mates.find((mate) => mate.isDefault);
        const done = !leader || !!leader.setupAt;
        if (done) remember(userId);
        if (live) setStatus(done ? "done" : "needed");
      })
      .catch(() => live && setStatus("done"));
    return () => {
      live = false;
    };
  }, [api, status, userId]);

  return { status };
}
