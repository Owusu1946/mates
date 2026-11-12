import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { WorkingDots } from "../chat/activity-line";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import { SlideView } from "./slide";
import { deckBusy, shareDeck, useDeck } from "./use-deck";

const THUMB = 136;
const STATUS: Record<string, string> = {
  queued: "Getting started",
  outlining: "Planning the story",
  writing: "Writing the slides",
  editing: "Updating the slides",
};

/** A deck in the chat: slides fill in as they're written, then open it or share it as PowerPoint. */
export function DeckCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const router = useRouter();
  const initial = state.deck;
  const live = useDeck(initial?.deckId);
  const [sharing, setSharing] = useState(false);
  if (!initial) return null;
  const deck = live.data;
  const status = deck?.status ?? initial.status;
  const busy = deckBusy(status);
  const built = deck?.slides.length ?? 0;
  const total = Math.max(deck?.total ?? initial.total, built);
  const open = (slide = 0) => {
    haptic.light();
    router.push({ pathname: "/deck/[id]", params: { id: initial.deckId, slide: String(slide) } } as never);
  };
  const share = async () => {
    if (!deck) return;
    setSharing(true);
    try {
      await shareDeck(getToken, deck);
    } catch (error) {
      Alert.alert("Couldn’t share the deck", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={{ marginVertical: 6, paddingVertical: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 12 }}>
      <View style={{ paddingHorizontal: 16, gap: 2 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>DECK{total ? ` · ${total} SLIDES` : ""}</Text>
        <Text numberOfLines={2} style={{ color: colors.text, fontSize: 16, fontFamily: "DMSans_600SemiBold" }}>{deck?.title ?? initial.title}</Text>
        {busy && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <WorkingDots color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              {STATUS[status]}
              {status === "writing" && total ? ` · ${built} of ${total}` : ""}
            </Text>
          </View>
        )}
      </View>

      {(built > 0 || busy) && deck && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {deck.slides.map((slide, i) => (
            <Animated.View key={slide.id} entering={FadeIn.duration(260)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Slide ${i + 1}`}
                disabled={busy && status !== "editing"}
                onPress={() => open(i)}
                style={{ borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}
              >
                <SlideView deck={deck} index={i} width={THUMB} />
              </Pressable>
            </Animated.View>
          ))}
          {Array.from({ length: Math.max(0, total - built) }, (_, i) => (
            <View key={`pending-${i}`} style={{ width: THUMB, height: (THUMB * 9) / 16, borderRadius: 8, backgroundColor: colors.surfaceElevated }} />
          ))}
        </ScrollView>
      )}

      {status === "failed" && <Text style={{ paddingHorizontal: 16, color: colors.error, fontSize: 14 }}>{deck?.error ?? initial.error ?? "The deck couldn’t be made."}</Text>}
      {status === "cancelled" && <Text style={{ paddingHorizontal: 16, color: colors.textSecondary, fontSize: 14 }}>Stopped.</Text>}
      {status === "ready" && deck?.error && <Text style={{ paddingHorizontal: 16, color: colors.textSecondary, fontSize: 13 }}>{deck.error}</Text>}

      {status === "ready" && deck && (
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16 }}>
          <Pressable accessibilityRole="button" onPress={() => open(0)} style={{ flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 14, backgroundColor: colors.primary }}>
            <Text style={{ color: colors.primaryForeground, fontSize: 15, fontFamily: "DMSans_600SemiBold" }}>Open</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share as PowerPoint"
            disabled={sharing}
            onPress={() => void share()}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: colors.border }}
          >
            {sharing ? <ActivityIndicator /> : <Text style={{ color: colors.text, fontSize: 15, fontFamily: "DMSans_600SemiBold" }}>PowerPoint</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}
