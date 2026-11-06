import type { WorkflowCard } from "@expojet/api-contract";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { ChatIcon } from "./chat-icon";

function Dot({ index, color }: { index: number; color: string }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0.35);
  useEffect(() => {
    if (reduced) return;
    opacity.set(withDelay(index * 160, withRepeat(withSequence(withTiming(1, { duration: 360 }), withTiming(0.35, { duration: 360 })), -1)));
    return () => cancelAnimation(opacity);
  }, [index, opacity, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }, style]} />;
}

/** Three softly pulsing dots: "working on it". Still under reduced motion. */
export function WorkingDots({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {[0, 1, 2].map((i) => <Dot key={i} index={i} color={color} />)}
    </View>
  );
}

function duration(startedAt?: string, finishedAt?: string) {
  if (!startedAt || !finishedAt) return null;
  const seconds = Math.max(1, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * Cooper's progress as one quiet line, the way ChatGPT and Grok show it: the current step with
 * pulsing dots while working, then "Worked for 12s", which opens the steps it took.
 */
export function ActivityLine({ state, messageRunning, isDark }: { state: WorkflowCard; messageRunning: boolean; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const muted = isDark ? "#a1a1aa" : "#71717a";
  const foreground = isDark ? "#fafafa" : "#18181b";
  const steps = state.activity ?? [];
  const working = state.phase === "running" && messageRunning;

  if (working)
    return (
      <View accessibilityLiveRegion="polite" accessibilityLabel={`${state.label}…`} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
        <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 15, color: muted }}>{state.label}</Text>
        <View style={{ paddingTop: 3 }}>
          <WorkingDots color={muted} />
        </View>
      </View>
    );

  const took = duration(state.startedAt, state.finishedAt);
  return (
    <View style={{ paddingVertical: 6, gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        hitSlop={8}
        style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}
      >
        <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 14, color: muted }}>
          {state.phase === "running" ? "Stopped" : took ? `Worked for ${took}` : "Worked on it"}
        </Text>
        <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
          <ChatIcon name="next" color={muted} size={14} />
        </View>
      </Pressable>
      {open && (
        <View style={{ gap: 6, paddingLeft: 2 }}>
          {steps.map((step, i) => (
            <View key={`${step.label}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ChatIcon name="check" color={muted} size={13} />
              <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 14, color: foreground }}>{step.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
