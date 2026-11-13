import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { ChatIcon } from "../../src/chat/chat-icon";
import { haptic } from "../../src/haptics";
import { usePullToRefresh } from "../../src/hooks/use-pull-to-refresh";
import { useTheme } from "../../src/theme/provider";
import { resetIn, resetTime, useUsage, type UsageWindow } from "../../src/usage/use-usage";

const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };
/** From here a bar turns to the warning colour. */
const HIGH_PCT = 90;

/** Your plan, and how much of each allowance is used and when it refills. */
export default function UsageScreen() {
  const { colors } = useTheme();
  const query = useUsage();
  const pull = usePullToRefresh(() => query.refetch());
  const usage = query.data;
  // Keep the relative reset time current while the screen is open.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const session = usage?.windows.find((w) => w.kind === "5h");
  const week = usage?.windows.find((w) => w.kind === "week");
  const noPlan = usage?.plan.id === "none";
  const blockedOn = (window?: UsageWindow) => !!window && !!usage?.enforced && usage.blocked?.reason === window.kind;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh usage"
              hitSlop={10}
              disabled={query.isFetching}
              onPress={() => {
                haptic.selection();
                void query.refetch();
              }}
              style={({ pressed }) => ({ opacity: pressed || query.isFetching ? 0.4 : 1, padding: 4 })}
            >
              <ChatIcon name="reload" color={colors.text} size={22} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        testID="usage-screen"
        style={{ flex: 1, backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 56, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      >
        {!usage && (query.isError ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontFamily: font.medium, fontSize: 15, paddingHorizontal: 4 }}>
            Couldn’t load your usage. Pull down to try again.
          </Text>
        ) : (
          <Skeleton />
        ))}

        {usage && !noPlan && (session || week) && (
          <View style={{ borderRadius: 22, borderCurve: "continuous", backgroundColor: colors.surface, overflow: "hidden" }}>
            {session && <WindowCard title="Current session" window={session} blocked={blockedOn(session)} />}
            {session && week && <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 18 }} />}
            {week && <WindowCard title="Weekly usage" window={week} blocked={blockedOn(week)} />}
          </View>
        )}

        {usage && (
          <>
            <SectionTitle>Your plan</SectionTitle>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 18, borderRadius: 22, borderCurve: "continuous", backgroundColor: colors.surface }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 17 }}>{usage.plan.label}</Text>
                {noPlan && <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, marginTop: 3 }}>Choose a plan to continue</Text>}
              </View>
              <Pressable
                testID="see-plans"
                accessibilityRole="button"
                onPress={() => {
                  haptic.selection();
                  router.push("/paywall");
                }}
                style={({ pressed }) => ({ paddingHorizontal: 15, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 15 }}>See plans</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

function SectionTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, paddingHorizontal: 4, paddingTop: 16, paddingBottom: 2 }}>{children}</Text>;
}

function WindowCard({ title, window, blocked }: { title: string; window: UsageWindow; blocked: boolean }) {
  const { colors } = useTheme();
  const high = blocked || window.usedPct >= HIGH_PCT;
  const fill = high ? colors.error : colors.primary;
  const detail = window.resetsAt
    ? window.kind === "5h"
      ? `Resets at ${resetTime(window.resetsAt)} · in ${resetIn(window.resetsAt)}`
      : `Resets ${resetTime(window.resetsAt)}`
    : "Starts with your next use";
  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${blocked ? "limit reached" : `${window.usedPct}% used`}. ${detail}`}
      style={{ paddingHorizontal: 18, paddingVertical: 18, gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 17 }}>{title}</Text>
        <Text style={{ color: blocked ? colors.error : colors.textSecondary, fontFamily: font.regular, fontSize: 15, fontVariant: ["tabular-nums"] }}>
          {blocked ? "Limit reached" : `${window.usedPct}% used`}
        </Text>
      </View>
      {/* The track is the fill's own colour, faint, so the bar reads as one piece. */}
      <View style={{ height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: `${fill}24` }}>
        <View style={{ width: `${Math.min(100, Math.max(window.usedPct, window.usedPct > 0 ? 2 : 0))}%`, height: "100%", borderRadius: 4, backgroundColor: fill }} />
      </View>
      <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13 }}>{detail}</Text>
    </View>
  );
}

function Skeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ borderRadius: 22, backgroundColor: colors.surface, overflow: "hidden" }}>
        {[0, 1].map((i) => <View key={i} style={{ padding: 18, gap: 12 }}>
          <View style={{ width: "40%", height: 13, borderRadius: 6, backgroundColor: colors.surfaceElevated }} />
          <View style={{ width: "100%", height: 8, borderRadius: 4, backgroundColor: colors.surfaceElevated }} />
          <View style={{ width: "30%", height: 10, borderRadius: 5, backgroundColor: colors.surfaceElevated }} />
        </View>)}
      </View>
    </View>
  );
}
