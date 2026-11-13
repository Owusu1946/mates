import { useEffect, useState, type ReactNode } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { haptic } from "../../src/haptics";
import { usePullToRefresh } from "../../src/hooks/use-pull-to-refresh";
import { useTheme } from "../../src/theme/provider";
import { resetIn, resetTime, useUsage, type UsageWindow } from "../../src/usage/use-usage";

const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };

/** Your plan, and how much of each allowance is used and when it refills. */
export default function UsageScreen() {
  const { colors } = useTheme();
  const query = useUsage();
  const pull = usePullToRefresh(() => query.refetch());
  const usage = query.data;
  // "Resets in 2 h 10 m" stays right while the screen is open.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const noPlan = usage?.plan.id === "none";
  const hasSession = !!usage?.windows.some((w) => w.kind === "5h");

  return (
    <ScrollView
      testID="usage-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 56, gap: 28 }}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        <Text style={{ color: colors.textMuted, fontFamily: font.medium, fontSize: 13 }}>Your plan</Text>
        {usage ? (
          <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: font.semibold, fontSize: 28 }}>{usage.plan.label}</Text>
        ) : (
          <View style={{ width: 120, height: 28, borderRadius: 8, backgroundColor: colors.surface }} />
        )}
      </View>

      {query.isError && !usage && (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>
          Couldn’t load your usage. Pull down to try again.
        </Text>
      )}

      {query.isLoading && <Skeleton />}

      {usage && !noPlan && (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 17, paddingHorizontal: 4 }}>Usage</Text>
          <Group>
            {usage.windows.map((window) => (
              <WindowRow key={window.kind} window={window} blocked={usage.enforced && usage.blocked?.reason === window.kind} />
            ))}
          </Group>
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 }}>
            {hasSession
              ? "Everything your mates do uses some: chats, research, calls, decks and code. Each allowance refills on its own: a session 5 hours after it starts, the week 7 days after."
              : "Everything your mates do uses some: chats, research, calls, decks and code. Max has no session limit; your weekly allowance refills 7 days after it starts."}
          </Text>
        </View>
      )}

      {usage && noPlan && (
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22, paddingHorizontal: 4 }}>
          Choose a plan to keep using your mates. Your chats, mates and memories are all still here.
        </Text>
      )}

      {usage && (
        <Pressable
          testID="see-plans"
          accessibilityRole="link"
          onPress={() => {
            haptic.selection();
            void Linking.openURL(usage.upgradeUrl);
          }}
          style={({ pressed }) => ({ height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 })}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: font.semibold, fontSize: 16 }}>{noPlan || usage.blocked ? "See plans" : "Compare plans"}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function WindowRow({ window, blocked }: { window: UsageWindow; blocked: boolean }) {
  const { colors } = useTheme();
  const title = window.kind === "5h" ? "Current session" : "This week";
  const detail = window.resetsAt
    ? window.kind === "5h"
      ? `Resets in ${resetIn(window.resetsAt)}`
      : `Resets ${resetTime(window.resetsAt)}`
    : window.kind === "5h"
      ? "Starts when you next use your mates"
      : "Starts with your next use";
  return (
    <View accessible accessibilityLabel={`${title}: ${window.usedPct}% used. ${detail}`} style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 16 }}>{title}</Text>
        <Text style={{ color: blocked ? colors.error : colors.textSecondary, fontFamily: font.medium, fontSize: 14, fontVariant: ["tabular-nums"] }}>
          {blocked ? "Limit reached" : `${window.usedPct}% used`}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: colors.surfaceElevated }}>
        <View style={{ width: `${Math.max(window.usedPct, window.usedPct > 0 ? 2 : 0)}%`, height: "100%", borderRadius: 3, backgroundColor: blocked ? colors.error : colors.text }} />
      </View>
      <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 13 }}>{detail}</Text>
    </View>
  );
}

/** Rows on one rounded surface, separated by hairlines: no box per row. */
function Group({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={{ borderRadius: 18, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface }}>
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.border }} />}
          {row}
        </View>
      ))}
    </View>
  );
}

function Skeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface, padding: 16, gap: 22 }}>
      {[0, 1].map((i) => (
        <View key={i} style={{ gap: 10 }}>
          <View style={{ width: "40%", height: 12, borderRadius: 6, backgroundColor: colors.surfaceElevated }} />
          <View style={{ width: "100%", height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated }} />
        </View>
      ))}
    </View>
  );
}
