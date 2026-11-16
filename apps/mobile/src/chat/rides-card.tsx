import { useAui, useAuiState } from "@assistant-ui/react-native";
import type { WorkflowCard } from "@expojet/api-contract";
import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/provider";
import { CardButton } from "./card-button";

function price(value: { amount: number; currency: string } | null) {
  if (!value) return "Price unavailable";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: value.currency }).format(value.amount); }
  catch { return `${value.currency} ${value.amount}`; }
}

export function RidesCard({ state }: { state: WorkflowCard }) {
  const data = state.rides;
  const { colors } = useTheme();
  const aui = useAui();
  const draft = useAuiState((value) => value.composer.text);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [refreshAdded, setRefreshAdded] = useState(false);
  const refreshInFlight = useRef(false);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  useEffect(() => {
    const remaining = Date.parse(data?.fetchedAt ?? "") + 10 * 60_000 - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) { setNow(Date.now()); return; }
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [data?.fetchedAt]);
  if (!data) return null;
  const age = Date.parse(data.fetchedAt);
  const stale = !Number.isFinite(age) || now - age >= 10 * 60_000;
  const refreshPrompt = `Check ${data.mode === "transit" ? "public transport" : data.mode === "rides" ? "ride prices" : "rides and public transport"} from ${data.from} to ${data.to} in ${data.country === "gh" ? "Ghana" : "Great Britain"} again.`;
  const refresh = () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!latestDraft.current.includes(refreshPrompt)) {
      const current = latestDraft.current;
      aui.thread.composer().setText(current.trim() ? `${current}\n${refreshPrompt}` : refreshPrompt);
    }
    setRefreshAdded(true);
  };
  async function openUber() {
    setError(null);
    try { await Linking.openURL("uber://riderequest"); }
    catch {
      try { await Linking.openURL("https://m.uber.com/"); }
      catch { setError("Couldn't open Uber. Try again."); }
    }
  }
  async function openStore(provider: "bolt" | "yango") {
    setError(null);
    const name = provider === "bolt" ? "Bolt" : "Yango";
    const url = Platform.OS === "ios"
      ? provider === "bolt" ? "https://apps.apple.com/app/id675033630" : "https://apps.apple.com/app/id1437157286"
      : `https://play.google.com/store/search?q=${encodeURIComponent(name)}&c=apps`;
    try { await Linking.openURL(url); }
    catch { setError(`Couldn't open ${provider === "bolt" ? "Bolt" : "Yango"}. Try again.`); }
  }
  const providers = new Set(data.rides?.map((option) => option.provider.toLowerCase()) ?? []);
  return <View style={{ gap: 10, paddingVertical: 6 }}>
    <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 17 }}>{data.from} → {data.to}</Text>
    {data.rides?.map((option, index) => <View key={`${option.provider}-${option.name}-${index}`} style={{ gap: 4, paddingVertical: 5 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ flex: 1, color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 14 }}>{option.provider} · {option.name}</Text>
        <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 14 }}>{price(option.price)}</Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{option.etaMinutes !== undefined ? `${option.etaMinutes} min pickup` : "Pickup time unavailable"}{option.availability === "unknown" ? " · Availability unconfirmed" : ""}</Text>
    </View>)}
    {providers.has("uber") || providers.has("bolt") || providers.has("yango") ? <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {providers.has("uber") ? <CardButton variant="text" label="Open Uber" onPress={() => void openUber()} /> : null}
        {providers.has("bolt") ? <CardButton variant="text" label={Platform.OS === "ios" ? "Bolt in App Store" : "Find Bolt on Google Play"} onPress={() => void openStore("bolt")} /> : null}
        {providers.has("yango") ? <CardButton variant="text" label={Platform.OS === "ios" ? "Yango in App Store" : "Find Yango on Google Play"} onPress={() => void openStore("yango")} /> : null}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Enter the trip in the provider's app.</Text>
    </View> : null}
    {data.transit?.map((route, index) => <View key={index} style={{ gap: 5, paddingVertical: 5 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === index }} onPress={() => setExpanded(expanded === index ? null : index)} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ flex: 1, color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 14 }}>{data.transitNetwork === "trotro" ? "Trotro" : data.transitNetwork === "bus" ? "Bus" : "Public transport"} · {expanded === index ? "Hide route" : "View route"}</Text>
        <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 14 }}>{route.fare !== undefined && route.currency ? price({ amount: route.fare, currency: route.currency }) : "Fare unavailable"}</Text>
      </Pressable>
      {route.minutes?.min !== undefined && route.minutes.max !== undefined ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{route.minutes.min}–{route.minutes.max} min</Text> : null}
      {expanded === index ? route.steps.map((step, stepIndex) => <Text key={stepIndex} style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{stepIndex + 1}. {step.instruction ?? step.route}{step.stopCount !== undefined ? ` · ${step.stopCount} stops` : ""}</Text>) : null}
    </View>)}
    {!data.rides?.length && !data.transit?.length ? <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{data.status === "partial" || data.ridesComplete === false || data.ridesStatus === "failed" || data.transitStatus === "failed" ? "Options couldn't be checked. Try again." : "No options found for this route."}</Text> : null}
    {providers.size === 1 ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Ride estimates from {data.rides?.[0]?.provider} only.</Text> : null}
    {data.ridesTruncated ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Showing the first 8 ride options.</Text> : null}
    {(data.status === "partial" || data.ridesComplete === false || data.ridesStatus === "failed" || data.transitStatus === "failed") && (data.rides?.length || data.transit?.length) ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Some options couldn't be checked.</Text> : null}
    {data.rideConnectionsAvailable ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Some routes may require a ride connection.</Text> : null}
    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{stale ? "Prices may have changed" : "Prices are estimates"} · Travel data by Sail</Text>
    {stale ? refreshAdded ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Request added to your message. Review it, then send to check again.</Text> : <CardButton variant="text" label="Check again" onPress={refresh} /> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontSize: 12 }}>{error}</Text> : null}
  </View>;
}
