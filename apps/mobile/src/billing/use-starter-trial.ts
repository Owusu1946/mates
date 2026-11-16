import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getCustomerInfo, identifyPurchases } from "./purchases";
import { onUsageChange } from "../chat/background-chat";
import { useUsage } from "../usage/use-usage";

const trialKey = (userId: string | null | undefined) => ["billing", "customer-info", userId] as const;

/** RevenueCat is authoritative for whether Starter is currently in its introductory period. */
export function useStarterTrial() {
  const { userId } = useAuth();
  const usage = useUsage();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: trialKey(userId),
    queryFn: async () => {
      if (!userId) throw new Error("No signed-in user");
      await identifyPurchases(userId);
      return getCustomerInfo(userId);
    },
    enabled: !!userId && usage.data?.plan.id === "starter",
    staleTime: 30_000,
  });

  useEffect(() => onUsageChange(() => {
    if (userId) void queryClient.invalidateQueries({ queryKey: trialKey(userId) });
  }), [queryClient, userId]);

  const entitlement = query.data?.entitlements.active.starter;
  const expirationDate = entitlement?.periodType === "TRIAL" ? entitlement.expirationDate : null;
  return { expirationDate, isLoading: query.isLoading };
}

export function formatTrialEnd(expirationDate: string | null) {
  if (!expirationDate) return null;
  const date = new Date(expirationDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
