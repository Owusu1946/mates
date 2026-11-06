import React, { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassStyle,
} from "expo-glass-effect";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/provider";

export interface LiquidGlassButtonProps {
  onPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  testID?: string;
  size?: number;
  glassEffectStyle?: GlassStyle;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  disabled?: boolean;
  /** Tints the glass; solid fallbacks use it as their fill. */
  tintColor?: string;
}

export function LiquidGlassButton({
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
  size = 40,
  glassEffectStyle = "regular",
  children,
  style,
  hitSlop = 6,
  disabled = false,
  tintColor,
}: LiquidGlassButtonProps) {
  const { isDark, colors } = useTheme();
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((val) => {
        if (mounted) setReduceTransparency(val);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const canUseGlass = useMemo(() => {
    if (Platform.OS !== "ios" || reduceTransparency) return false;
    try {
      return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
    } catch {
      return false;
    }
  }, [reduceTransparency]);

  const handlePress = (e: GestureResponderEvent) => {
    if (disabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress?.(e);
  };

  const borderRadius = size / 2;

  // Native iOS Liquid Glass
  if (canUseGlass) {
    return (
      <GlassView
        isInteractive
        glassEffectStyle={glassEffectStyle}
        tintColor={tintColor}
        colorScheme={isDark ? "dark" : "light"}
        style={[
          {
            width: size,
            height: size,
            borderRadius,
            borderCurve: "continuous",
            alignItems: "center",
            justifyContent: "center",
          },
          style,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          testID={testID}
          disabled={disabled}
          hitSlop={hitSlop}
          onPress={handlePress}
          style={{
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children}
        </Pressable>
      </GlassView>
    );
  }

  // Fallback with BlurView when transparency is allowed
  if (Platform.OS === "ios" && !reduceTransparency) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius,
            borderCurve: "continuous",
            overflow: "hidden",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark ? "rgba(255, 255, 255, 0.15)" : colors.border,
            backgroundColor: tintColor,
            boxShadow: isDark
              ? "0 2px 8px rgba(0, 0, 0, 0.3)"
              : "0 2px 8px rgba(0, 0, 0, 0.08)",
          },
          style,
        ]}
      >
        <BlurView
          tint={isDark ? "systemMaterialDark" : "systemMaterialLight"}
          intensity={70}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          testID={testID}
          disabled={disabled}
          hitSlop={hitSlop}
          onPress={handlePress}
          style={({ pressed }) => ({
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
            backgroundColor: pressed
              ? isDark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(0, 0, 0, 0.04)"
              : "transparent",
          })}
        >
          {children}
        </Pressable>
      </View>
    );
  }

  // Accessible solid fallback for Reduce Transparency or Android / Web
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={handlePress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius,
          borderCurve: "continuous",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: tintColor ?? (pressed
            ? isDark
              ? "rgba(255, 255, 255, 0.12)"
              : "rgba(0, 0, 0, 0.08)"
            : isDark
            ? "rgba(39, 39, 42, 0.9)"
            : colors.background),
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isDark
            ? "0 2px 8px rgba(0, 0, 0, 0.3)"
            : "0 2px 8px rgba(0, 0, 0, 0.08)",
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
