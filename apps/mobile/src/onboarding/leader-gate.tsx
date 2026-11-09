import * as SecureStore from "expo-secure-store";
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useMates } from "../mates/data";
import { useTheme } from "../theme/provider";
import { LeaderSetup } from "./leader-setup";

const readyKey = (userId: string) => `mates.leader-ready.${userId}`;

/**
 * Shows the lead-mate setup screen to accounts that haven't done it yet, otherwise the app.
 * A per-user flag on the device lets returning users skip the wait for their mates to load.
 */
export function LeaderGate({ userId, children }: { userId: string; children: ReactNode }) {
  const { colors } = useTheme();
  const mates = useMates();
  const [ready, setReady] = useState<boolean | null>(null);
  const leader = mates.data?.mates.find((mate) => mate.isDefault);

  useEffect(() => {
    SecureStore.getItemAsync(readyKey(userId))
      .then((value) => setReady(value === "1"))
      .catch(() => setReady(false));
  }, [userId]);

  useEffect(() => {
    if (leader?.setupAt) SecureStore.setItemAsync(readyKey(userId), "1").catch(() => undefined);
  }, [leader?.setupAt, userId]);

  if (ready) return children;
  if (leader && !leader.setupAt && mates.data) return <LeaderSetup leader={leader} presets={mates.data.presets} onDone={() => setReady(true)} />;
  // First launch on this device: wait for the mates to know. If they can't load, don't block the app.
  if (ready === null || (!mates.data && !mates.isError)) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return children;
}
