import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { WorkingDots } from "../chat/activity-line";
import { ChatIcon } from "../chat/chat-icon";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { SlideView } from "./slide";
import { deckBusy, shareDeck, useDeck } from "./use-deck";

const STATUS: Record<string, string> = {
  queued: "Getting started",
  outlining: "Planning the story",
  writing: "Writing slides",
  editing: "Updating slides",
};

/**
 * A deck in the chat, the way an image or file sits in a reply: the cover slide large and rounded,
 * with the title and a quiet share button under it. No box around it. While it's being made, the
 * first finished slide becomes the cover and a thin bar shows progress.
 */
export function DeckCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const router = useRouter();
  const initial = state.deck;
  const live = useDeck(initial?.deckId);
  const [width, setWidth] = useState(0);
  const [sharing, setSharing] = useState(false);
  if (!initial) return null;
  const deck = live.data;
  const status = deck?.status ?? initial.status;
  const busy = deckBusy(status);
  const built = deck?.slides.length ?? 0;
  const total = Math.max(deck?.total ?? initial.total, built);
  const ready = status === "ready" && !!deck && built > 0;
  const title = deck?.title ?? initial.title;
  const error = status === "failed" ? (deck?.error ?? initial.error ?? "The deck couldn’t be made.") : status === "ready" ? deck?.error : null;

  const open = () => {
    if (!deck || built === 0) return;
    haptic.light();
    router.push({ pathname: "/deck/[id]", params: { id: initial.deckId, slide: "0" } } as never);
  };
  const share = async () => {
    if (!deck) return;
    haptic.light();
    setSharing(true);
    try {
      await shareDeck(getToken, deck);
    } catch (cause) {
      Alert.alert("Couldn’t share the deck", cause instanceof Error ? cause.message : "Try again.");
    } finally {
      setSharing(false);
    }
  };

  const meta = busy
    ? `${STATUS[status] ?? "Working"}${status === "writing" && total ? ` · ${built} of ${total}` : ""}`
    : status === "failed"
      ? "Couldn’t finish"
      : status === "cancelled"
        ? "Stopped"
        : `Presentation · ${built} slide${built === 1 ? "" : "s"}`;

  return (
    <View style={{ marginVertical: 8, gap: 10 }} onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
      {status !== "failed" && status !== "cancelled" && width > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ready ? `Open ${title}` : `${title}, ${meta}`}
          disabled={!deck || built === 0}
          onPress={open}
          style={({ pressed }) => ({ borderRadius: 14, borderCurve: "continuous", overflow: "hidden", opacity: pressed ? 0.9 : 1, backgroundColor: colors.surface })}
        >
          {deck && built > 0 ? (
            <View style={{ opacity: status === "editing" ? 0.55 : 1 }}>
              <SlideView deck={deck} index={0} width={width} />
            </View>
          ) : (
            <View style={{ width, height: (width * 9) / 16, alignItems: "center", justifyContent: "center" }}>
              <ChatIcon name="presentation" color={colors.textMuted} size={28} />
            </View>
          )}
          {busy && total > 0 && (
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: "rgba(127,127,127,0.25)" }}>
              <View style={{ width: `${Math.max(6, (built / total) * 100)}%`, height: 3, backgroundColor: colors.text }} />
            </View>
          )}
        </Pressable>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable accessibilityRole="button" disabled={!ready} onPress={open} style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={2} style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 15, lineHeight: 20 }}>
            {title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {busy && <WorkingDots color={colors.textMuted} />}
            <Text style={{ color: status === "failed" ? colors.error : colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13 }}>{meta}</Text>
          </View>
        </Pressable>
        {ready && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share as PowerPoint"
            disabled={sharing}
            hitSlop={6}
            onPress={() => void share()}
            style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 })}
          >
            {sharing ? <ActivityIndicator size="small" /> : <ChatIcon name="share" color={colors.text} size={18} />}
          </Pressable>
        )}
      </View>

      {error ? <Text style={{ color: status === "failed" ? colors.error : colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 18 }}>{error}</Text> : null}
    </View>
  );
}
