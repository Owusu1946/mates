import React from "react";
import { Platform, StyleSheet, useColorScheme, View, type ViewProps } from "react-native";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";

export interface GlassCardProps extends ViewProps {
  glassEffectStyle?: "regular" | "clear";
  intensity?: number;
  tint?: "systemMaterial" | "systemChromeMaterial" | "light" | "dark" | "default";
}

export function GlassCard({
  children,
  style,
  glassEffectStyle = "regular",
  intensity = 60,
  tint,
  ...props
}: GlassCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const resolvedTint = tint ?? (Platform.OS === "ios" ? "systemMaterial" : isDark ? "dark" : "light");

  let canUseGlass = false;
  try {
    canUseGlass = Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    canUseGlass = false;
  }

  if (canUseGlass) {
    return (
      <GlassView
        glassEffectStyle={glassEffectStyle}
        style={[styles.glassCard, style]}
        {...props}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.fallbackContainer,
        Platform.OS === "android" && {
          backgroundColor: isDark ? "rgba(24, 24, 27, 0.85)" : "rgba(255, 255, 255, 0.85)",
          borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.2)",
        },
        style,
      ]}
      {...props}
    >
      <BlurView
        intensity={intensity}
        tint={resolvedTint as any}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  glassCard: {
    borderRadius: 24,
    overflow: "hidden",
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  fallbackContainer: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: Platform.OS === "android" ? "rgba(255, 255, 255, 0.85)" : "transparent",
  },
  content: {
    padding: 20,
  },
});
