import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { ChatIcon } from "./chat-icon";
import { createApiClient } from "../data/api";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";

const ITALIC = "DMSans_500Medium_Italic";

/**
 * A quiet, slanted "✦ Memory updated" line instead of a card: the sparkle twinkles once when it
 * appears. `onPress` opens it (details, or the Memory screen).
 */
function MemoryLine({ label, detail, struck, onPress, accessibilityLabel }: { label: string; detail?: string; struck?: boolean; onPress: () => void; accessibilityLabel: string }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const twinkle = useSharedValue(reduced ? 1 : 0.4);
  useEffect(() => {
    if (reduced) return;
    twinkle.value = withSequence(withDelay(120, withSpring(1.25, { damping: 6, stiffness: 260 })), withTiming(1, { duration: 220 }));
  }, [reduced, twinkle]);
  const sparkle = useAnimatedStyle(() => ({ transform: [{ scale: twinkle.value }, { rotate: `${(twinkle.value - 1) * 90}deg` }] }));
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
        <Text style={{ color: colors.textMuted, fontFamily: ITALIC, fontSize: 13.5, letterSpacing: 0.1, textDecorationLine: struck ? "line-through" : "none" }}>
          {label}
          {detail ? <Text style={{ fontFamily: "DMSans_400Regular" }}>{`  ·  ${detail}`}</Text> : null}
        </Text>
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
      <MemoryLine label={label} struck={undone} accessibilityLabel={`${label}: ${memory.text}. ${open ? "Hide" : "Show"} details`} onPress={() => setOpen((value) => !value)} />
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
