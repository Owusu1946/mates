import { useAui, useAuiState } from "@assistant-ui/react-native";
import type { WorkflowCard } from "@expojet/api-contract";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/provider";
import { CardButton } from "./card-button";

function price(value: { amount: number; currency: string } | null) {
  if (!value) return "Price unavailable";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: value.currency }).format(value.amount); }
  catch { return `${value.currency} ${value.amount}`; }
}

function providerLabel(value: string) {
  const known = { uber: "Uber", bolt: "Bolt", yango: "Yango" } as const;
  return known[value.toLowerCase() as keyof typeof known] ?? value;
}

function SectionTitle({ title }: { title: string }) {
  const { colors } = useTheme();
  return <Text selectable style={{ color: colors.textMuted, fontFamily: "DMSans_600SemiBold", fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" }}>{title}</Text>;
}

export function RidesCard({ state }: { state: WorkflowCard }) {
  const data = state.rides;
  const { colors } = useTheme();
  const aui = useAui();
  const draft = useAuiState((value) => value.composer.text);
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [refreshState, setRefreshState] = useState<"idle" | "added" | "sent">("idle");
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

  const fetchedAt = Date.parse(data.fetchedAt);
  const stale = !Number.isFinite(fetchedAt) || now - fetchedAt >= 10 * 60_000;
  const rides = data.rides ?? [];
  const pricedRoutes = (data.transit ?? []).filter(
    (route) => Number.isFinite(route.fare) && Boolean(route.currency?.trim()),
  );
  const routes = Array.from(
    new Map(
      pricedRoutes.map((route) => [
        JSON.stringify([route.fare, route.currency, route.minutes, route.steps.map((step) => [step.instruction, step.route, step.fare, step.stopCount])]),
        route,
      ]),
    ).values(),
  );
  const hasRides = rides.length > 0;
  const hasRoutes = routes.length > 0;
  const rideFailed = data.ridesStatus === "failed" || data.ridesStatus === "unavailable";
  const noResults = !hasRides && !hasRoutes;
  const failed = rideFailed || data.status === "unavailable";
  const shouldOfferRetry = stale || noResults || rideFailed || data.status === "unavailable" || data.ridesComplete === false;
  const refreshPrompt = `Check ${data.mode === "transit" ? "public transport" : data.mode === "rides" ? "ride prices" : "rides and public transport"} from ${data.from} to ${data.to} in ${data.country === "gh" ? "Ghana" : "Great Britain"} again.`;

  const refresh = () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const composer = aui.thread.composer();
    const current = latestDraft.current.trim();
    if (current) {
      if (!current.includes(refreshPrompt)) composer.setText(`${current}\n${refreshPrompt}`);
      setRefreshState("added");
    } else {
      composer.setText(refreshPrompt);
      composer.send();
      setRefreshState("sent");
    }
  };

  const noResultMessage = failed
    ? data.mode === "rides"
      ? "Ride quotes couldn't be loaded."
      : data.mode === "transit"
        ? "No priced route found."
        : "Travel options couldn't be loaded."
    : data.mode === "transit"
      ? "No priced route found."
      : data.mode === "rides"
        ? "No ride quotes found."
        : "No priced ride options found.";

  return (
    <View style={{ gap: 14, marginVertical: 6, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 18, borderCurve: "continuous", backgroundColor: colors.surface }}>
      <View style={{ gap: 3 }}>
        <Text selectable style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 16 }}>{data.from} → {data.to}</Text>
      </View>

      {noResults ? (
        <View style={{ gap: 8 }}>
          <Text selectable style={{ color: failed ? colors.textSecondary : colors.textMuted, fontSize: 14 }}>{noResultMessage}</Text>
          {shouldOfferRetry ? <RetryAction refreshState={refreshState} label={failed ? "Try again" : "Check again"} onPress={refresh} /> : null}
        </View>
      ) : (
        <>
          {data.mode !== "transit" && (hasRides || rideFailed || data.status === "unavailable") ? (
            <View style={{ gap: 8 }}>
              {hasRides ? rides.map((option, index) => (
                <View key={`${option.provider}-${option.name}-${index}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 7, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text selectable numberOfLines={1} style={{ color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 14 }}>{providerLabel(option.provider)} · {option.name}</Text>
                    {option.etaMinutes !== undefined ? <Text selectable style={{ color: colors.textMuted, fontSize: 12 }}>{option.etaMinutes} min pickup</Text> : null}
                  </View>
                  <Text selectable style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 14, fontVariant: ["tabular-nums"] }}>{price(option.price)}</Text>
                </View>
              )) : <Text selectable style={{ color: colors.textMuted, fontSize: 13 }}>Ride quotes unavailable.</Text>}
              {hasRides && data.ridesComplete === false ? <Text selectable style={{ color: colors.textMuted, fontSize: 12 }}>Some prices unavailable.</Text> : null}
              {hasRides && rideFailed ? <Text selectable style={{ color: colors.textMuted, fontSize: 12 }}>Some ride quotes unavailable.</Text> : null}

            </View>
          ) : null}

          {data.mode !== "rides" && hasRoutes ? (
            <View style={{ gap: 8 }}>
              <SectionTitle title={data.transitNetwork === "trotro" ? "Trotro" : data.transitNetwork === "bus" ? "Bus" : "Public transport"} />
              {hasRoutes ? routes.map((route, index) => {
                const open = expandedRoute === index;
                const duration = route.minutes ? `${route.minutes.min}–${route.minutes.max} min` : null;
                const hasSteps = route.steps.length > 0;
                const firstStep = route.steps[0]?.instruction ?? route.steps[0]?.route;
                return (
                  <View key={`route-${index}`} style={{ gap: 8, paddingTop: index === 0 ? 0 : 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text selectable style={{ color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 14 }}>{hasSteps ? routes.length > 1 ? `Route ${index + 1}` : "Suggested route" : "Estimated fare"}</Text>
                        {[duration, firstStep].filter(Boolean).length ? <Text selectable style={{ color: colors.textMuted, fontSize: 12 }}>{[duration, firstStep].filter(Boolean).join(" · ")}</Text> : null}
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 3 }}>
                        <Text selectable style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 14, fontVariant: ["tabular-nums"] }}>{route.fare !== undefined && route.currency ? price({ amount: route.fare, currency: route.currency }) : "Fare unavailable"}</Text>
                        {route.steps.length ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${open ? "Hide" : "View"} route ${index + 1}`} onPress={() => setExpandedRoute(open ? null : index)} hitSlop={6}>
                          <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_500Medium", fontSize: 12 }}>{open ? "Hide route" : "View route"}</Text>
                        </Pressable> : null}
                      </View>
                    </View>
                    {open ? <View style={{ gap: 6, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: colors.border }}>
                      {route.steps.length ? route.steps.map((step, stepIndex) => (
                        <Text selectable key={`step-${stepIndex}`} style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>{stepIndex + 1}. {step.instruction ?? step.route}{step.stopCount !== undefined ? ` · ${step.stopCount} stops` : ""}</Text>
                      )) : <Text selectable style={{ color: colors.textMuted, fontSize: 12 }}>Route steps weren't provided.</Text>}
                    </View> : null}
                  </View>
                );
              }) : null}
            </View>
          ) : null}
        </>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text selectable style={{ flex: 1, color: colors.textMuted, fontSize: 11 }}>{stale ? "Prices may have changed" : "Estimates · Prices may change"}</Text>
        {shouldOfferRetry && !noResults ? <RetryAction refreshState={refreshState} label={stale ? "Check again" : "Try again"} onPress={refresh} /> : null}
      </View>
    </View>
  );
}

function RetryAction({ refreshState, label, onPress }: { refreshState: "idle" | "added" | "sent"; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  if (refreshState !== "idle") return <Text selectable style={{ color: colors.textMuted, fontSize: 11 }}>{refreshState === "sent" ? "Checking again…" : "Added to message."}</Text>;
  return <CardButton variant="text" label={label} onPress={onPress} />;
}
