import type { WorkflowCard } from "@expojet/api-contract";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { ShimmerText } from "../chat/shimmer-text";
import { CardButton } from "../chat/card-button";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { pageBusy, usePage, usePageActions } from "./use-page";

const STATUS: Record<string, string> = {
  queued: "Getting started",
  outlining: "Planning the page",
  writing: "Writing",
  editing: "Updating the page",
};

/** "2h ago", "yesterday", "3 Nov". */
function ago(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * A page in the chat: its emoji and title, the sections as they're written, then Open and Share.
 * Kept live while it's made or changed; once shared, the link is one tap away.
 */
export function PageCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const router = useRouter();
  const initial = state.page;
  const live = usePage(initial?.pageId);
  const actions = usePageActions(initial?.pageId);
  if (!initial) return null;
  const card = live.data?.card.page ?? initial;
  const busy = pageBusy(card.status);
  const failed = card.status === "failed";
  const ready = card.status === "ready" || card.status === "editing";
  const line = { fontFamily: "DMSans_500Medium", fontSize: 14.5, letterSpacing: 0.1 } as const;

  const open = () => {
    haptic.light();
    router.push({ pathname: "/page/[id]", params: { id: card.pageId } } as never);
  };
  const status = busy
    ? `${STATUS[card.status] ?? "Working"}${card.status === "writing" && card.total ? ` · ${card.built} of ${card.total}` : ""}`
    : failed ? "Couldn’t finish" : card.status === "cancelled" ? "Stopped" : card.version > 1 && card.summary ? `Updated ${ago(card.updatedAt)} · ${card.summary}` : card.shared ? "Shared" : "Private";

  return (
    <Animated.View style={{ marginVertical: 6, gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ready ? `Open ${card.title}` : `${card.title}, ${status}`}
        disabled={!ready && !card.sections.length}
        onPress={open}
        style={({ pressed }) => ({ flexDirection: "row", gap: 12, padding: 14, borderRadius: 16, borderCurve: "continuous", backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 })}
      >
        <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
          <Text style={{ fontSize: 22 }}>{card.emoji ?? "📄"}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={2} style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 16, lineHeight: 21 }}>{card.title}</Text>
          {busy ? (
            <ShimmerText text={status} active style={{ ...line, fontSize: 13 }} />
          ) : (
            <Text numberOfLines={1} style={{ color: failed ? colors.error : colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13 }}>{status}</Text>
          )}
          {card.sections.length > 0 && (
            <Animated.Text entering={FadeIn.duration(200)} numberOfLines={2} style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 12.5, lineHeight: 17 }}>
              {card.sections.join(" · ")}
            </Animated.Text>
          )}
        </View>
      </Pressable>

      {failed && !!card.error && <Text style={{ color: colors.error, fontFamily: "DMSans_400Regular", fontSize: 13.5, lineHeight: 19 }}>{card.error}</Text>}
      {ready && !!card.error && <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 18 }}>{card.error}</Text>}

      {ready && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <CardButton label="Open" onPress={open} />
          {card.shared && card.url
            ? <CardButton label="Share link" variant="outlined" onPress={() => void actions.openShareSheet(card.title, card.url!)} />
            : <CardButton label="Share" variant="outlined" onPress={() => void actions.share(card.title)} />}
        </View>
      )}
    </Animated.View>
  );
}
