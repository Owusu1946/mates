import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { haptic } from "../haptics";
import { resetTime, usageNotice, useUsage, windowName } from "./use-usage";

type Colors = { foreground: string; mutedForeground: string; destructive: string };

const font = { regular: "DMSans_400Regular", semibold: "DMSans_600SemiBold" };

const openUsage = () => {
  haptic.selection();
  router.push("/usage");
};

/** A quiet line above the composer: nearly used, out until a time, or no plan. Nothing otherwise. */
export function UsageLine({ colors }: { colors: Colors }) {
  const { data } = useUsage();
  const notice = data?.enforced ? usageNotice(data) : null;
  if (!notice) return null;
  const text =
    notice.kind === "no_plan"
      ? "Choose a plan to keep using mates."
      : notice.kind === "blocked"
        ? `You’ve reached your ${windowName(notice.window)}${notice.resetsAt ? ` · resets ${resetTime(notice.resetsAt)}` : ""}`
        : `You’ve used ${notice.usedPct}% of your ${windowName(notice.window)}${notice.resetsAt ? ` · resets ${resetTime(notice.resetsAt)}` : ""}`;
  return (
    <Pressable
      testID="usage-line"
      accessibilityRole="button"
      accessibilityHint="Opens plan and usage"
      accessibilityLiveRegion="polite"
      onPress={openUsage}
      hitSlop={6}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, paddingBottom: 8, opacity: pressed ? 0.6 : 1 })}
    >
      <Text numberOfLines={2} style={{ flexShrink: 1, textAlign: "center", color: notice.kind === "nearly" ? colors.mutedForeground : colors.foreground, fontFamily: font.regular, fontSize: 13, lineHeight: 18 }}>
        {text}
      </Text>
      <Text style={{ color: colors.foreground, fontFamily: font.semibold, fontSize: 13 }}>{notice.kind === "nearly" ? "Details" : "See plans"}</Text>
    </Pressable>
  );
}

/** Whether a failed reply was refused for usage, from the error the chat runtime kept. */
export function limitError(status: unknown): { message: string } | null {
  const error = (status as { type?: string; reason?: string; error?: { code?: unknown; message?: unknown } } | undefined)?.error;
  if (!error || (error.code !== "usage_limit" && error.code !== "plan_required")) return null;
  return { message: typeof error.message === "string" ? error.message : "You’ve reached your usage limit." };
}

/** In place of "couldn't reply · Try again": why, when it comes back, and where to see plans. */
export function LimitReply({ message, colors }: { message: string; colors: Colors }) {
  const { data } = useUsage();
  const resetsAt = data?.blocked?.resetsAt;
  return (
    <View testID="limit-reply" style={{ gap: 6 }}>
      <Text selectable style={{ color: colors.foreground, fontFamily: font.regular, fontSize: 15, lineHeight: 21 }}>
        {resetsAt ? `${message.replace(/ It resets in .*$/, "")} You can pick this up at ${resetTime(resetsAt)}.` : message}
      </Text>
      <Pressable accessibilityRole="button" onPress={openUsage} hitSlop={6} style={({ pressed }) => ({ alignSelf: "flex-start", paddingVertical: 2, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: colors.foreground, fontFamily: font.semibold, fontSize: 14 }}>See plans and usage</Text>
      </Pressable>
    </View>
  );
}
