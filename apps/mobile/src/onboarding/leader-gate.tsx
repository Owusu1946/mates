import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { readCache, writeCache } from "../data/offline-cache";
import { useMates } from "../mates/data";
import { useTheme } from "../theme/provider";
import { LeaderSetup } from "./leader-setup";

const READY = "leader-ready";

/**
 * Shows the lead-mate setup screen to accounts that haven't done it yet, otherwise the app.
 * Once setup is known to be done, the device cache remembers it, so returning users get the app
 * on the first frame instead of waiting for their mates to load.
 */
export function LeaderGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const mates = useMates();
  const [ready, setReady] = useState(() => readCache<boolean>(READY)?.data === true);
  const leader = mates.data?.mates.find((mate) => mate.isDefault);
  // Once setup starts it stays until it calls onDone: saving the leader marks it set up, and the
  // About step after it must not be swapped out for the app.
  const setup = useRef<typeof leader>(undefined);

  useEffect(() => {
    if (leader?.setupAt) writeCache(READY, true);
  }, [leader?.setupAt]);

  if (ready) return children;
  if (mates.data && leader && (!leader.setupAt || setup.current)) {
    setup.current ??= leader;
    return <LeaderSetup leader={setup.current} presets={mates.data.presets} onDone={() => setReady(true)} />;
  }
  // First launch on this device: wait for the mates to know. If they can't load, don't block the app.
  if (!mates.data && !mates.isError) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return children;
}
