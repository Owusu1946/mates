import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Easing, FadeIn, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import { ChatIcon } from "./chat-icon";
import { createApiClient } from "../data/api";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";

const ITALIC = "DMSans_500Medium_Italic";

/** Lines that have already played their entrance this session: scrolling back never replays it. */
const played = new Set<string>();

/** Width of the shimmer's highlight, in letters. */
const BAND = 4;
const SHIMMER_MS = 950;

/** One letter of a shimmering label: brightens as the highlight passes over it. */
function ShimmerLetter({ char, index, progress, total, base, highlight, style }: { char: string; index: number; progress: SharedValue<number>; total: number; base: string; highlight: string; style: object }) {
  const animated = useAnimatedStyle(() => {
    // The band travels from before the first letter to past the last.
    const centre = progress.value * (total + BAND * 2) - BAND;
    const t = Math.max(0, 1 - Math.abs(index - centre) / BAND);
    return { color: interpolateColor(t * t * (3 - 2 * t), [0, 1], [base, highlight]) };
  });
  return <Animated.Text style={[style, animated]}>{char}</Animated.Text>;
}

/**
 * A quiet, slanted "✦ Memory updated" line instead of a card. When it appears, the sparkle eases
 * in with the faintest turn and a soft highlight sweeps once across the words, like a thinking
 * shimmer. `onPress` opens it (details, or the Memory screen).
 */
function MemoryLine({ id, label, detail, struck, onPress, accessibilityLabel }: { id: string; label: string; detail?: string; struck?: boolean; onPress: () => void; accessibilityLabel: string }) {
  const { colors } = useTheme();
  // Still when reduced motion is on, or when this line already played (decided once, on mount).
  const motionOff = useReducedMotion();
  const [replay] = useState(() => played.has(id));
  const reduced = motionOff || replay;
  const twinkle = useSharedValue(reduced ? 1 : 0);
  const sweep = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    played.add(id);
    twinkle.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    sweep.value = withDelay(180, withTiming(1, { duration: SHIMMER_MS, easing: Easing.inOut(Easing.quad) }));
  }, [reduced, id, twinkle, sweep]);
  const sparkle = useAnimatedStyle(() => ({
    opacity: 0.4 + twinkle.value * 0.6,
    transform: [{ scale: 0.88 + twinkle.value * 0.12 }, { rotate: `${(1 - twinkle.value) * -14}deg` }],
  }));
  const text = { color: colors.textMuted, fontFamily: ITALIC, fontSize: 13.5, letterSpacing: 0.1 };
  // The letters shimmer only the first time and when not struck through; otherwise plain text.
  const shimmer = !reduced && !struck;
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(260)} style={{ alignSelf: "flex-start", marginVertical: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, opacity: pressed ? 0.55 : 1 })}
      >
        <Animated.View style={sparkle}>
          <ChatIcon name="sparkles" color={colors.textMuted} size={14} />
        </Animated.View>
        {shimmer ? (
          // A hair of room on the right, so the last letter's slant isn't clipped.
          <View style={{ flexDirection: "row", paddingRight: 2 }} accessible={false}>
            {[...label].map((char, i) => (
              <ShimmerLetter key={i} char={char} index={i} progress={sweep} total={label.length} base={colors.textMuted} highlight={colors.text} style={text} />
            ))}
          </View>
        ) : (
          <Text style={[text, { textDecorationLine: struck ? "line-through" : "none" }]}>{label}</Text>
        )}
        {detail ? <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13.5 }}>{`·  ${detail}`}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

/** A memory a mate saved mid-chat: "Memory updated"; tap to see it, undo it or manage memories. */
export function MemoryCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const router = useRouter();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [open, setOpen] = useState(false);
  const [undone, setUndone] = useState(false);
  const [busy, setBusy] = useState(false);
  const memory = state.memory;
  if (!memory) return null;
  const undo = async () => {
    setBusy(true);
    try {
      const response = await api.v1.memories[":id"].$delete({ param: { id: memory.id } });
      if (response.ok || response.status === 404) {
        haptic.light();
        setUndone(true);
      }
    } finally {
      setBusy(false);
    }
  };
  const label = undone ? "Memory not saved" : state.label;
  return (
    <View style={{ alignSelf: "flex-start", maxWidth: "100%" }}>
      <MemoryLine id={`memory_${memory.id}`} label={label} struck={undone} accessibilityLabel={`${label}: ${memory.text}. ${open ? "Hide" : "Show"} details`} onPress={() => setOpen((value) => !value)} />
      {open && (
        <Animated.View entering={FadeIn.duration(180)} style={{ marginLeft: 20, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.border, gap: 6, marginBottom: 4 }}>
          <Text selectable style={{ color: undone ? colors.textMuted : colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 14, lineHeight: 20, textDecorationLine: undone ? "line-through" : "none" }}>
            {memory.text}
          </Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            {memory.action === "saved" && !undone && <TextAction label={busy ? "Undoing…" : "Undo"} disabled={busy} onPress={() => void undo()} />}
            <TextAction label="Manage" onPress={() => router.push("/(app)/memory")} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

/** Several memories saved at once (from "About you"): the same line, opening Memory. */
export function MemoriesChip({ state }: { state: WorkflowCard }) {
  const router = useRouter();
  const count = state.memories?.count ?? 0;
  return (
    <MemoryLine
      id={`memories_${state.label}_${count}`}
      label={state.label}
      detail={count > 1 ? `${count} things` : undefined}
      accessibilityLabel={`${state.label}: ${count} ${count === 1 ? "memory" : "memories"} saved. Open Memory`}
      onPress={() => router.push("/(app)/memory")}
    />
  );
}

function TextAction({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" hitSlop={8} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.5 : 1 })}>
      <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
