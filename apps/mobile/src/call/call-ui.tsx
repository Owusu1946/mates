import { useEffect } from "react";
import { Pressable, Text, View, type DimensionValue } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { PolygonAvatar } from "../components/polygon-avatar/polygon-avatar";
import { shapeOf, type PolygonState } from "../components/polygon-avatar/polygon-avatar-core";
import { ChatIcon } from "../chat/chat-icon";
import { LiquidGlassButton } from "../components/ui/liquid-glass-button";
import { useTheme } from "../theme/provider";

const palettes = {
  light: {
    background: "#F7F6F3",
    tile: "#FFFFFF",
    tileBorder: "#E7E5E0",
    foreground: "#18181b",
    mutedForeground: "#71717a",
    control: "#ECEBE7",
    controlActive: "#18181b",
    controlActiveForeground: "#fafafa",
    speaking: "#d27e41",
    danger: "#E5484D",
    dangerForeground: "#ffffff",
    peach: "#E8C4B4",
    caption: "rgba(24, 24, 27, 0.06)",
  },
  dark: {
    background: "#111113",
    tile: "#1C1C1F",
    tileBorder: "rgba(255, 255, 255, 0.08)",
    foreground: "#fafafa",
    mutedForeground: "#a1a1aa",
    control: "#2A2A2E",
    controlActive: "#fafafa",
    controlActiveForeground: "#18181b",
    speaking: "#e5a36f",
    danger: "#E5484D",
    dangerForeground: "#ffffff",
    peach: "#BD8873",
    caption: "rgba(255, 255, 255, 0.06)",
  },
};

export type CallColors = typeof palettes.light;

export function useCallColors() {
  const { isDark } = useTheme();
  return isDark ? palettes.dark : palettes.light;
}

export const font = {
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semibold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
};

/** Small avatars draw at 30fps; `still` holds a single frame for lists and chips. */
export function MateAvatar({ size, state = "idle", gradient, shape, still = false }: { size: number; state?: PolygonState; gradient?: [string, string, string]; shape?: string; still?: boolean }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <PolygonAvatar state={state} size={size} gradient={gradient} shape={shapeOf(shape)} paused={still} frameRate={size >= 120 ? 60 : 30} title={null} />
    </View>
  );
}

/** Soft ring that breathes while a participant talks; static under reduced motion. */
export function SpeakingRing({ active, color, radius }: { active: boolean; color: string; radius: number }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (active && !reduced) pulse.set(withRepeat(withTiming(1, { duration: 900 }), -1, true));
    else { cancelAnimation(pulse); pulse.set(0); }
  }, [active, reduced, pulse]);
  const style = useAnimatedStyle(() => ({
    opacity: active ? 0.55 + pulse.get() * 0.45 : 0,
    transform: [{ scale: 1 + pulse.get() * 0.015 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", inset: 0, borderRadius: radius, borderWidth: 2.5, borderColor: color, borderCurve: "continuous" }, style]}
    />
  );
}

export function ParticipantTile({
  name, role, state, gradient, shape, speaking, joining, width, height, avatarSize, onLongPress,
}: {
  name: string;
  role: string;
  state: PolygonState;
  gradient: [string, string, string];
  shape?: string;
  speaking: boolean;
  joining: boolean;
  width: DimensionValue;
  height: number;
  avatarSize: number;
  onLongPress?: () => void;
}) {
  const colors = useCallColors();
  return (
    <Pressable
      onLongPress={onLongPress}
      accessibilityLabel={`${name}, ${role}${joining ? ", joining" : speaking ? ", speaking" : ""}`}
      accessibilityHint={onLongPress ? "Long press to remove from call" : undefined}
      style={{
        width, height, borderRadius: 28, borderCurve: "continuous",
        backgroundColor: colors.tile, borderWidth: 1, borderColor: colors.tileBorder,
        alignItems: "center", justifyContent: "center", opacity: joining ? 0.6 : 1,
      }}
    >
      <MateAvatar size={avatarSize} state={state} gradient={gradient} shape={shape} still={joining} />
      <View style={{ position: "absolute", left: 14, bottom: 12, right: 14, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: font.semibold, fontSize: 14 }}>{name}</Text>
        <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontFamily: font.regular, fontSize: 12, flexShrink: 1 }}>
          {joining ? "Joining…" : role}
        </Text>
      </View>
      <SpeakingRing active={speaking} color={colors.speaking} radius={28} />
    </Pressable>
  );
}

export function SelfTile({ initials, muted, speaking }: { initials: string; muted: boolean; speaking: boolean }) {
  const colors = useCallColors();
  return (
    <View
      accessibilityLabel={muted ? "You, muted" : "You"}
      style={{
        width: 92, height: 120, borderRadius: 22, borderCurve: "continuous",
        backgroundColor: colors.peach, alignItems: "center", justifyContent: "center",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
      }}
    >
      <Text style={{ color: "#3b2a22", fontFamily: font.bold, fontSize: 26 }}>{initials}</Text>
      <Text style={{ position: "absolute", bottom: 8, color: "#3b2a22", fontFamily: font.medium, fontSize: 12 }}>You</Text>
      {muted && (
        <View style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
          <ChatIcon name="micOff" color="#ffffff" size={14} />
        </View>
      )}
      <SpeakingRing active={speaking && !muted} color={colors.speaking} radius={22} />
    </View>
  );
}

export function CallControl({
  icon, label, onPress, active = false, danger = false, size = 58,
}: {
  icon: Parameters<typeof ChatIcon>[0]["name"];
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  size?: number;
}) {
  const colors = useCallColors();
  const foreground = danger ? colors.dangerForeground : active ? colors.controlActiveForeground : colors.foreground;
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <LiquidGlassButton
        accessibilityLabel={label}
        onPress={onPress}
        size={size}
        tintColor={danger ? colors.danger : active ? colors.controlActive : undefined}
      >
        <ChatIcon name={icon} color={foreground} size={24} />
      </LiquidGlassButton>
      <Text style={{ color: colors.mutedForeground, fontFamily: font.medium, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

/** Round glass icon button for headers and sheets. */
export function GlassIconButton({ icon, label, onPress, size = 40 }: { icon: Parameters<typeof ChatIcon>[0]["name"]; label: string; onPress: () => void; size?: number }) {
  const colors = useCallColors();
  return (
    <LiquidGlassButton accessibilityLabel={label} onPress={onPress} size={size}>
      <ChatIcon name={icon} color={colors.foreground} size={size / 2} />
    </LiquidGlassButton>
  );
}

/** Full-width or fixed-width glass pill for primary call actions. */
export function GlassPillButton({
  label, onPress, icon, prominent = false, height = 56, width = "100%", disabled = false, fontSize = 17,
}: {
  label: string;
  onPress: () => void;
  icon?: Parameters<typeof ChatIcon>[0]["name"];
  prominent?: boolean;
  height?: number;
  width?: DimensionValue;
  disabled?: boolean;
  fontSize?: number;
}) {
  const colors = useCallColors();
  const foreground = prominent ? colors.controlActiveForeground : colors.foreground;
  return (
    <LiquidGlassButton
      accessibilityLabel={label}
      onPress={onPress}
      size={height}
      disabled={disabled}
      tintColor={prominent ? colors.controlActive : undefined}
      style={{ width }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 }}>
        {icon && <ChatIcon name={icon} color={foreground} size={22} />}
        <Text numberOfLines={1} style={{ color: foreground, fontFamily: font.semibold, fontSize }}>{label}</Text>
      </View>
    </LiquidGlassButton>
  );
}
