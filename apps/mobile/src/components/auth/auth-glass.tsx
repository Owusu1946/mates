import { useEffect, useState, type PropsWithChildren } from "react";
import {
  AccessibilityInfo,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { useAuthTheme } from "../../theme/auth";

export function AuthGlass({
  children,
  style,
  interactive = false,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; interactive?: boolean }>) {
  const { colors, isDark } = useAuthTheme();
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (mounted) setReduceTransparency(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  const glass =
    Platform.OS === "ios" &&
    !reduceTransparency &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable();
  if (glass)
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        style={style}
      >
        {children}
      </GlassView>
    );
  if (Platform.OS === "ios" && !reduceTransparency)
    return (
      <BlurView
        tint={isDark ? "systemMaterialDark" : "systemMaterialLight"}
        intensity={65}
        style={[style, { overflow: "hidden" }]}
      >
        {children}
      </BlurView>
    );
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
