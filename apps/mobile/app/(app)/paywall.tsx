import { useAuth } from "@clerk/expo";
import SegmentedControl from "@expo/ui/community/segmented-control";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { checkTrialEligibility, getCustomerInfo, getOfferings, identifyPurchases, purchasePackage, purchaseUserCancelled, PurchaseSyncError, restorePurchases, showManageSubscriptions } from "../../src/billing/purchases";
import { haptic } from "../../src/haptics";
import { useToast } from "../../src/components/toast";
import { useSession } from "../../src/session/provider";
import { useTheme } from "../../src/theme/provider";
import { useUsage } from "../../src/usage/use-usage";

type Plan = "starter" | "plus" | "pro" | "max";
type Period = "monthly" | "yearly";
const plans: { id: Plan; name: string; detail: string }[] = [
  { id: "starter", name: "Starter", detail: "Up to 5 mates · 3 routines" },
  { id: "plus", name: "Plus", detail: "2× Starter usage · 10 mates · 2 active missions" },
  { id: "pro", name: "Pro", detail: "6× Starter usage · 20 mates · unlimited routines" },
  { id: "max", name: "Max", detail: "12× Starter usage · 10 active missions" },
];
const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };

function matchingPackage(packages: PurchasesPackage[], plan: Plan, period: Period) {
  const productIds = [`mates_${plan}_${period}`];
  // The Test Store's original yearly identifier was archived and cannot be reused.
  if (plan === "starter" && period === "yearly") productIds.push("mates_starter_annual");
  return packages.find((item) => productIds.includes(item.product.identifier));
}

const starterProductIds = ["mates_starter_monthly", "mates_starter_yearly", "mates_starter_annual"];

function trialDuration(product: PurchasesPackage["product"]) {
  const intro = product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const count = intro.periodNumberOfUnits;
  const unit = intro.periodUnit.toLowerCase().replace(/s$/, "");
  const label = `${unit}${count === 1 ? "" : "s"}`;
  return `${count} ${label}`;
}

export default function PaywallScreen() {
  const { colors, isDark } = useTheme();
  const { userId, getToken } = useAuth();
  const session = useSession();
  const usage = useUsage();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ required?: string }>();
  const [period, setPeriod] = useState<Period>("monthly");
  const [selected, setSelected] = useState<Plan>("starter");
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [activeProducts, setActiveProducts] = useState<string[]>([]);
  const [trialEligibility, setTrialEligibility] = useState<Record<string, { status: number }> | null>(null);
  const [managementUrl, setManagementUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [dismissAfterAccess, setDismissAfterAccess] = useState(false);
  const [leavingForSignOut, setLeavingForSignOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setMessage(null);
    try {
      await identifyPurchases(userId);
      const offerings = await getOfferings(userId);
      const customer = await getCustomerInfo(userId);
      setActiveProducts(customer.activeSubscriptions);
      setManagementUrl(customer.managementURL);
      const available = offerings.current?.availablePackages ?? [];
      setPackages(available);
      const eligibility = await checkTrialEligibility(userId, starterProductIds).catch(() => ({}));
      setTrialEligibility(eligibility as Record<string, { status: number }>);
      if (!available.length) setMessage("Plans aren’t available right now.");
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes("Purchases are unavailable")
        ? "In-app purchases aren’t configured for this build."
        : "Couldn’t load plans.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);
  const chosen = matchingPackage(packages, selected, period);
  const currentPlan = usage.data?.plan.id;
  const isCurrentProduct = !!chosen && activeProducts.includes(chosen.product.identifier);
  const required = params.required === "1";
  const blocking = !leavingForSignOut && !accessGranted && (currentPlan === "none" || required);
  usePreventRemove(blocking, () => {});
  const trialPeriod = chosen ? trialDuration(chosen.product) : null;
  const trialEligible = Platform.OS === "ios" && selected === "starter" && !!chosen && !!trialPeriod &&
    trialEligibility?.[chosen.product.identifier]?.status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;

  useEffect(() => {
    if (blocking || !dismissAfterAccess) return;
    setDismissAfterAccess(false);
    router.back();
  }, [blocking, dismissAfterAccess]);

  const subscribe = async () => {
    if (!userId || !chosen || isCurrentProduct) return;
    setBusy(true);
    setMessage(null);
    try {
      await purchasePackage(userId, getToken, chosen);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mates", userId] }),
        queryClient.invalidateQueries({ queryKey: ["chats", userId] }),
      ]);
      await queryClient.refetchQueries({ queryKey: ["usage", userId], type: "active" });
      const latestUsage = queryClient.getQueryData<{ plan: { id: string } }>(["usage", userId]);
      if (!latestUsage || latestUsage.plan.id === "none") {
        toast.show({ message: "Your purchase went through; your plan is still updating.", tone: "success" });
        return;
      }
      setAccessGranted(true);
      setDismissAfterAccess(true);
      haptic.selection();
      toast.show({ message: trialEligible && trialPeriod ? `Your ${trialPeriod} free trial has started.` : "Your plan is active.", tone: "success" });
    } catch (error) {
      if (purchaseUserCancelled(error)) {
        toast.show({ message: "Purchase cancelled.", tone: "info" });
        return;
      }
      toast.show({ message: error instanceof PurchaseSyncError ? "Purchased. Your plan is still updating." : "Purchase failed. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await restorePurchases(userId, getToken);
      setActiveProducts(result.customerInfo.activeSubscriptions);
      setManagementUrl(result.customerInfo.managementURL);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mates", userId] }),
        queryClient.invalidateQueries({ queryKey: ["chats", userId] }),
      ]);
      toast.show({ message: result.usage.plan.id === "none" ? "No active plan found." : `Your plan: ${result.usage.plan.label}.`, tone: "success" });
      if (result.usage.plan.id !== "none") {
        await queryClient.refetchQueries({ queryKey: ["usage", userId], type: "active" });
        setAccessGranted(true);
        if (blocking) setDismissAfterAccess(true);
      }
    } catch (error) {
      toast.show({ message: error instanceof PurchaseSyncError ? "Restored. Your plan is still updating." : "Restore failed. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const link = (url: string) => { void Linking.openURL(url).catch(() => toast.show({ message: "Couldn’t open the link.", tone: "error" })); };
  const manage = async () => {
    try {
      if (Platform.OS === "ios") await showManageSubscriptions();
      else link(managementUrl ?? "https://play.google.com/store/account/subscriptions");
    } catch {
      link(managementUrl ?? (Platform.OS === "ios" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions"));
    }
  };
  return (
    <ScrollView testID="paywall-screen" style={{ flex: 1, backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 18 }} showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ gestureEnabled: !blocking, headerBackVisible: !blocking }} />
      <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 25 }}>Choose a plan</Text>
      {blocking ? <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>Choose a plan to continue using Mates.</Text> : null}
      {trialEligible && chosen && trialPeriod ? <View style={{ gap: 5 }}>
        <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 20 }}>Try Starter free for {trialPeriod}</Text>
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>Then {chosen.product.priceString} per {period === "monthly" ? "month" : "year"}. Cancel anytime before the trial ends.</Text>
      </View> : null}
      <SegmentedControl
        values={["Monthly", "Yearly"]}
        selectedIndex={period === "monthly" ? 0 : 1}
        appearance={isDark ? "dark" : "light"}
        enabled={!busy}
        onChange={(event) => setPeriod(event.nativeEvent.selectedSegmentIndex === 0 ? "monthly" : "yearly")}
      />
      {period === "yearly" ? <Text style={{ alignSelf: "center", marginTop: -10, color: colors.textSecondary, fontFamily: font.medium, fontSize: 12 }}>2 months free</Text> : null}
      {loading ? <ActivityIndicator /> : <View accessibilityRole="radiogroup" style={{ backgroundColor: colors.surface, borderRadius: 20, overflow: "hidden" }}>
        {plans.map((plan, index) => {
          const item = matchingPackage(packages, plan.id, period);
          const active = selected === plan.id;
          return <Pressable key={plan.id} accessibilityRole="radio" accessibilityState={{ selected: active, disabled: busy || !item }} disabled={busy || !item} onPress={() => setSelected(plan.id)} style={{ paddingHorizontal: 16, paddingVertical: 15, borderTopWidth: index ? 1 : 0, borderColor: colors.border, opacity: item ? 1 : 0.5, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: active ? 5 : 1, borderColor: active ? colors.primary : colors.textSecondary }} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 16 }}>{plan.name}{currentPlan === plan.id && item && activeProducts.includes(item.product.identifier) ? " · Current" : ""}{trialEligible && plan.id === "starter" ? " · Free trial" : ""}</Text><Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 15 }}>{item ? `${item.product.priceString} / ${period === "monthly" ? "month" : "year"}` : "Unavailable"}</Text></View>
              <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13 }}>{plan.detail}</Text>
            </View>
          </Pressable>;
        })}
      </View>}
      {(message || (!loading && !packages.length)) && <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text accessibilityLiveRegion="polite" style={{ flex: 1, color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>{message}</Text>
        {!loading && !packages.length && <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={{ color: colors.primary, fontFamily: font.semibold }}>Try again</Text></Pressable>}
      </View>}
      <Pressable accessibilityRole="button" disabled={busy || loading || !chosen || isCurrentProduct} onPress={() => void subscribe()} style={{ alignItems: "center", padding: 16, borderRadius: 20, backgroundColor: colors.primary, opacity: busy || loading || !chosen || isCurrentProduct ? 0.45 : 1 }}>{busy ? <ActivityIndicator /> : <Text style={{ color: colors.background, fontFamily: font.semibold, fontSize: 16 }}>{isCurrentProduct ? "Current plan" : trialEligible ? "Start free trial" : "Subscribe"}</Text>}</Pressable>
      <View style={{ alignItems: "center", gap: 14 }}>
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 12, lineHeight: 18, textAlign: "center" }}>{trialEligible && chosen ? `Payment is charged to your Apple ID at the end of the ${trialPeriod} trial unless cancelled at least 24 hours before. Then ${chosen.product.priceString} per ${period === "monthly" ? "month" : "year"}; subscriptions renew automatically.` : chosen ? `${chosen.product.priceString} per ${period === "monthly" ? "month" : "year"}. Subscriptions renew automatically until cancelled.` : "Subscriptions renew automatically until cancelled."}</Text>
        <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 18 }}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void restore()}><Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 13 }}>Restore purchases</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void manage()}><Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 13 }}>Manage subscription</Text></Pressable>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 18 }}>
          <Pressable accessibilityRole="link" onPress={() => link("https://agents.askorin.app/terms")}><Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 12 }}>Terms</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={() => link("https://agents.askorin.app/privacy")}><Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 12 }}>Privacy</Text></Pressable>
        </View>
        {blocking ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setLeavingForSignOut(true); session.signOut(); }}><Text style={{ color: colors.textMuted, fontFamily: font.medium, fontSize: 13 }}>Sign out</Text></Pressable> : null}
      </View>
    </ScrollView>
  );
}
