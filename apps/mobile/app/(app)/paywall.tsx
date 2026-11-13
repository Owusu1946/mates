import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { getCustomerInfo, getOfferings, identifyPurchases, purchasePackage, PurchaseSyncError, restorePurchases } from "../../src/billing/purchases";
import { haptic } from "../../src/haptics";
import { useTheme } from "../../src/theme/provider";
import { useUsage } from "../../src/usage/use-usage";

type Plan = "starter" | "plus" | "pro" | "max";
type Period = "monthly" | "yearly";
const plans: { id: Plan; name: string; detail: string }[] = [
  { id: "starter", name: "Starter", detail: "Up to 5 mates · 3 routines" },
  { id: "plus", name: "Plus", detail: "2× Starter usage · up to 10 mates" },
  { id: "pro", name: "Pro", detail: "6× Starter usage · up to 20 mates" },
  { id: "max", name: "Max", detail: "12× Starter usage · no session limit" },
];
const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };

function matchingPackage(packages: PurchasesPackage[], plan: Plan, period: Period) {
  const productIds = [`mates_${plan}_${period}`];
  // The Test Store's original yearly identifier was archived and cannot be reused.
  if (plan === "starter" && period === "yearly") productIds.push("mates_starter_annual");
  return packages.find((item) => productIds.includes(item.product.identifier));
}

export default function PaywallScreen() {
  const { colors } = useTheme();
  const { userId, getToken } = useAuth();
  const usage = useUsage();
  const [period, setPeriod] = useState<Period>("monthly");
  const [selected, setSelected] = useState<Plan>("starter");
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [activeProducts, setActiveProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setMessage(null);
    try {
      await identifyPurchases(userId);
      const offerings = await getOfferings(userId);
      const customer = await getCustomerInfo(userId);
      setActiveProducts(customer.activeSubscriptions);
      const available = offerings.current?.availablePackages ?? [];
      setPackages(available);
      if (!available.length) setMessage("Plans aren’t available right now.");
    } catch {
      setMessage("Couldn’t load plans.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);
  const chosen = matchingPackage(packages, selected, period);
  const currentPlan = usage.data?.plan.id;
  const isCurrentProduct = !!chosen && activeProducts.includes(chosen.product.identifier);

  const subscribe = async () => {
    if (!userId || !chosen || isCurrentProduct) return;
    setBusy(true);
    setMessage(null);
    try {
      await purchasePackage(userId, getToken, chosen);
      haptic.selection();
      router.back();
    } catch (error) {
      if (typeof error === "object" && error !== null && "userCancelled" in error && error.userCancelled === true) return;
      setMessage(error instanceof PurchaseSyncError ? error.message : "Couldn’t complete your purchase. Please try again.");
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
      setMessage(result.usage.plan.id === "none" ? "No active plan found." : `Your plan: ${result.usage.plan.label}.`);
    } catch (error) {
      setMessage(error instanceof PurchaseSyncError ? error.message : "Couldn’t restore purchases. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const link = (url: string) => { void Linking.openURL(url).catch(() => setMessage("Couldn’t open the link.")); };
  return (
    <ScrollView testID="paywall-screen" style={{ flex: 1, backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 18 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 25 }}>Choose a plan</Text>
      <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup">
        {(["monthly", "yearly"] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: period === value, disabled: busy }} disabled={busy} onPress={() => setPeriod(value)} style={{ flex: 1, alignItems: "center", padding: 12, borderRadius: 16, backgroundColor: period === value ? colors.surfaceElevated : colors.surface }}><Text style={{ color: colors.text, fontFamily: font.medium }}>{value === "monthly" ? "Monthly" : "Yearly"}</Text></Pressable>)}
      </View>
      {loading ? <ActivityIndicator /> : <View accessibilityRole="radiogroup" style={{ backgroundColor: colors.surface, borderRadius: 20, overflow: "hidden" }}>
        {plans.map((plan, index) => {
          const item = matchingPackage(packages, plan.id, period);
          const active = selected === plan.id;
          return <Pressable key={plan.id} accessibilityRole="radio" accessibilityState={{ selected: active, disabled: busy || !item }} disabled={busy || !item} onPress={() => setSelected(plan.id)} style={{ paddingHorizontal: 16, paddingVertical: 15, borderTopWidth: index ? 1 : 0, borderColor: colors.border, opacity: item ? 1 : 0.5, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: active ? 5 : 1, borderColor: active ? colors.primary : colors.textSecondary }} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 16 }}>{plan.name}{currentPlan === plan.id && item && activeProducts.includes(item.product.identifier) ? " · Current" : ""}</Text><Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 15 }}>{item ? `${item.product.priceString} / ${period === "monthly" ? "month" : "year"}` : "Unavailable"}</Text></View>
              <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13 }}>{plan.detail}</Text>
            </View>
          </Pressable>;
        })}
      </View>}
      {(message || (!loading && !packages.length)) && <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text accessibilityLiveRegion="polite" style={{ flex: 1, color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>{message}</Text>
        {!loading && !packages.length && <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={{ color: colors.primary, fontFamily: font.semibold }}>Try again</Text></Pressable>}
      </View>}
      <Pressable accessibilityRole="button" disabled={busy || loading || !chosen || isCurrentProduct} onPress={() => void subscribe()} style={{ alignItems: "center", padding: 16, borderRadius: 20, backgroundColor: colors.primary, opacity: busy || loading || !chosen || isCurrentProduct ? 0.45 : 1 }}>{busy ? <ActivityIndicator /> : <Text style={{ color: colors.background, fontFamily: font.semibold, fontSize: 16 }}>{isCurrentProduct ? "Current plan" : "Continue"}</Text>}</Pressable>
      <View style={{ alignItems: "center", gap: 14 }}>
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 12, lineHeight: 18, textAlign: "center" }}>Renews {period === "monthly" ? "monthly" : "yearly"} until cancelled. Cancel in your store account.</Text>
        <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 18 }}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void restore()}><Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 13 }}>Restore purchases</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={() => link(Platform.OS === "ios" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions")}><Text style={{ color: colors.textSecondary, fontFamily: font.medium, fontSize: 13 }}>Manage subscription</Text></Pressable>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 18 }}>
          <Pressable accessibilityRole="link" onPress={() => link("https://agents.askorin.app/terms")}><Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 12 }}>Terms</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={() => link("https://agents.askorin.app/privacy")}><Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 12 }}>Privacy</Text></Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
