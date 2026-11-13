import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { ChatIcon } from "../../src/chat/chat-icon";
import { haptic } from "../../src/haptics";
import { usePullToRefresh } from "../../src/hooks/use-pull-to-refresh";
import { useTheme } from "../../src/theme/provider";
import { paceWarning, resetIn, resetTime, roughly, useUsage, windowName, type Usage, type UsageWindow } from "../../src/usage/use-usage";

const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };
/** From here a bar turns to the warning colour. */
const HIGH_PCT = 90;

/** Your plan, and how much of each allowance is used and when it refills. */
export default function UsageScreen() {
  const { colors } = useTheme();
  const query = useUsage();
  const pull = usePullToRefresh(() => query.refetch());
  const usage = query.data;
  // Reset times and the pace line stay right while the screen is open.
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
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      >
        {usage ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontFamily: font.regular, fontSize: 17, lineHeight: 24, paddingHorizontal: 4, paddingBottom: 12 }}>
            {headline(usage)}
          </Text>
        ) : query.isError ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontFamily: font.medium, fontSize: 15, paddingHorizontal: 4 }}>
            Couldn’t load your usage. Pull down to try again.
          </Text>
        ) : (
          <Skeleton />
        )}

        {usage && !noPlan && session && <WindowCard title="Current session" window={session} blocked={blockedOn(session)} />}

        {usage && !noPlan && week && (
          <>
            <SectionTitle>Weekly limit</SectionTitle>
            <WindowCard title="This week" window={week} blocked={blockedOn(week)} />
          </>
        )}

        {usage && (
          <>
            <SectionTitle>Plan</SectionTitle>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16, borderRadius: 22, borderCurve: "continuous", backgroundColor: colors.surface }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 17 }}>{usage.plan.label}</Text>
                <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13 }}>
                  {noPlan ? "Choose a plan to keep using your mates" : session ? "Session and weekly limits" : "Weekly limit only, no session limit"}
                </Text>
              </View>
              <Pressable
                testID="see-plans"
                accessibilityRole="link"
                onPress={() => {
                  haptic.selection();
                  void Linking.openURL(usage.upgradeUrl);
                }}
                style={({ pressed }) => ({ paddingHorizontal: 18, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 15 }}>See plans</Text>
              </Pressable>
            </View>
            <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13, lineHeight: 19, paddingHorizontal: 4, paddingTop: 8 }}>
              Everything your mates do uses some: chats, research, calls, decks and code. Limits refill on their own.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

/** The line at the top: out, about to run out at this pace, or all clear. */
function headline(usage: Usage) {
  if (usage.plan.id === "none") return "Choose a plan to keep using your mates. Your chats, mates and memories are all still here.";
  if (usage.enforced && usage.blocked && usage.blocked.reason !== "no_plan") {
    const at = usage.blocked.resetsAt;
    return `You’ve reached your ${windowName(usage.blocked.reason)}.${at ? ` It resets ${usage.blocked.reason === "5h" ? `at ${resetTime(at)}` : resetTime(at)}.` : ""}`;
  }
  const pace = paceWarning(usage);
  if (pace) {
    const reset = pace.window.resetsAt!;
    return `Heads up. At this pace you’ll run out ${roughly(pace.runsOutAt)}, before ${pace.window.kind === "5h" ? "this session resets" : `${new Date(reset).toLocaleDateString(undefined, { weekday: "long" })}’s reset`}.`;
  }
  const fullest = Math.max(0, ...usage.windows.map((w) => w.usedPct));
  return fullest === 0 ? "Nothing used yet. Your allowance is ready when you are." : "You’re well within your limits.";
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
    : window.kind === "5h"
      ? "Starts when you next use your mates"
      : "Starts with your next use";
  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${blocked ? "limit reached" : `${window.usedPct}% used`}. ${detail}`}
      style={{ paddingHorizontal: 18, paddingVertical: 16, gap: 12, borderRadius: 22, borderCurve: "continuous", backgroundColor: colors.surface }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 17 }}>{title}</Text>
        <Text style={{ color: blocked ? colors.error : colors.textSecondary, fontFamily: font.regular, fontSize: 15, fontVariant: ["tabular-nums"] }}>
          {blocked ? "Limit reached" : `${window.usedPct}% used`}
        </Text>
      </View>
      {/* The track is the fill's own colour, faint, so the bar reads as one piece. */}
      <View style={{ height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: `${fill}2E` }}>
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
      <View style={{ width: "75%", height: 16, borderRadius: 8, backgroundColor: colors.surface, marginBottom: 12 }} />
      {[0, 1].map((i) => (
        <View key={i} style={{ borderRadius: 22, backgroundColor: colors.surface, padding: 18, gap: 12 }}>
          <View style={{ width: "40%", height: 13, borderRadius: 6, backgroundColor: colors.surfaceElevated }} />
          <View style={{ width: "100%", height: 8, borderRadius: 4, backgroundColor: colors.surfaceElevated }} />
          <View style={{ width: "30%", height: 10, borderRadius: 5, backgroundColor: colors.surfaceElevated }} />
        </View>
      ))}
    </View>
  );
}
