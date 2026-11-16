import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { router, usePathname } from "expo-router";
import { readCache, writeCache } from "../data/offline-cache";
import { useMates } from "../mates/data";
import { useTheme } from "../theme/provider";
import { onPlanRequired } from "../chat/background-chat";
import { useUsage } from "../usage/use-usage";
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

  // Existing users may have completed setup before this device cache existed. A newly created
  // leader remains in the setup flow until its About step calls onDone.
  if (ready || (leader?.setupAt && !setup.current)) return <PlanAccessGate>{children}</PlanAccessGate>;
  if (mates.data && leader && (!leader.setupAt || setup.current)) {
    setup.current ??= leader;
    return <LeaderSetup leader={setup.current} presets={mates.data.presets} onDone={() => setReady(true)} />;
  }
  // First launch on this device: wait for the mates to know. If they can't load, don't block the app.
  if (!mates.data && !mates.isError) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return children;
}

/** Opens the blocking paywall after setup when the server says the account has no plan. */
function PlanAccessGate({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const usage = useUsage();
  const pathname = usePathname();
  const openedForUser = useRef<string | null>(null);

  const openPaywall = useCallback(() => {
    if (!userId || pathname.includes("/paywall") || openedForUser.current === userId) return;
    openedForUser.current = userId;
    router.push({ pathname: "/paywall", params: { required: "1" } });
  }, [pathname, userId]);

  useEffect(() => onPlanRequired(openPaywall), [openPaywall]);

  useEffect(() => {
    if (usage.data?.plan.id !== "none") {
      if (openedForUser.current === userId) openedForUser.current = null;
      return;
    }
    openPaywall();
  }, [openPaywall, usage.data?.plan.id, userId]);

  return children;
}
