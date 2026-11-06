import { useEffect } from "react";
import { Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LiquidGlassButton } from "../components/ui/liquid-glass-button";
import { formatDuration, useCall } from "./call-model";
import { font } from "./call-ui";

const PILL_WIDTH = 148;
const LIVE = "#30A46C";

function LiveDot({ speaking }: { speaking: boolean }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (speaking && !reduced) pulse.set(withRepeat(withTiming(1, { duration: 700 }), -1, true));
    else { cancelAnimation(pulse); pulse.set(0); }
  }, [speaking, reduced, pulse]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - pulse.get()), transform: [{ scale: 1 + pulse.get() * 0.9 }] }));
  return (
    <View style={{ width: 10, height: 10, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: "#ffffff" }, halo]} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#ffffff" }} />
    </View>
  );
}

/** Floating return-to-call pill shown on every screen while a minimized call is live. */
export function CallPill() {
  const call = useCall();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  if (call.phase !== "live" || pathname === "/call") return null;
  const speaking = call.members.find(m => m.speaking);
  const label = call.members.length > 1 ? `${call.lead.name} +${call.members.length - 1}` : call.lead.name;
  return (
    <Animated.View
      entering={FadeInUp}
      exiting={FadeOutUp}
      pointerEvents="box-none"
      style={{ position: "absolute", top: insets.top + 10, left: 0, right: 0, alignItems: "center", zIndex: 50 }}
    >
      <LiquidGlassButton
        accessibilityLabel={`Return to call with ${label}, ${formatDuration(call.elapsed)}`}
        accessibilityHint={speaking ? `${speaking.name} is talking` : undefined}
        onPress={() => router.push("/call")}
        size={36}
        tintColor={LIVE}
        style={{ width: PILL_WIDTH }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }}>
          <LiveDot speaking={!!speaking} />
          <Text numberOfLines={1} style={{ color: "#ffffff", fontFamily: font.semibold, fontSize: 13, flexShrink: 1 }}>{label}</Text>
          <Text style={{ color: "#ffffff", fontFamily: font.medium, fontSize: 13, fontVariant: ["tabular-nums"], opacity: 0.85 }}>
            {formatDuration(call.elapsed)}
          </Text>
        </View>
      </LiquidGlassButton>
    </Animated.View>
  );
}
