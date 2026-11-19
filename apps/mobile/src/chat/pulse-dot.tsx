import { useEffect } from "react";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

/**
 * The mate is working on a reply and no tool is running yet: one small filled sphere that breathes,
 * like ChatGPT's. It rests at full size when the system asks for reduced motion.
 */
export function PulseDot({ color, size = 12 }: { color: string; size?: number }) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse, reducedMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.value * 0.45,
    transform: [{ scale: 0.82 + pulse.value * 0.3 }],
  }));
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Thinking"
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}
